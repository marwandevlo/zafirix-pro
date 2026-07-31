import { isValidIce, isValidIf } from '@/app/lib/atlas-morocco-compliance';
import { canAccessCompany } from '@/app/lib/atlas-permissions';
import type { SupabaseClient } from '@supabase/supabase-js';

export function normalizeSupplierIceIf(body: {
  supplierIce?: string | null;
  supplierIf?: string | null;
}): { supplierIce: string; supplierIf: string } | { error: string; message: string } {
  const supplierIce = String(body.supplierIce ?? '').replace(/\D/g, '');
  const supplierIf = String(body.supplierIf ?? '').replace(/\D/g, '');

  if (!isValidIce(supplierIce)) {
    return { error: 'invalid_ice', message: 'ICE fournisseur invalide (15 chiffres requis).' };
  }
  if (!isValidIf(supplierIf)) {
    return { error: 'invalid_if', message: 'IF fournisseur invalide (7 à 8 chiffres requis).' };
  }

  return { supplierIce, supplierIf };
}

type SupplierInvoiceScopeRow = {
  id: string;
  company_id: string | null;
  user_id: string;
};

export type TvaSuggestionLinkRow = {
  id: string;
  source_invoice_id: string | null;
  source_document_id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  base_ht: number | string | null;
  amount: number | string | null;
  rate: number | string | null;
};

export async function assertSupplierInvoiceCompanyAccess(
  admin: SupabaseClient,
  userId: string,
  supplierInvoiceId: string,
): Promise<{ companyId: string | null }> {
  const { data: row, error } = await admin
    .from('atlas_supplier_invoices')
    .select('id, company_id, user_id')
    .eq('id', supplierInvoiceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error('not_found');

  const companyId = row.company_id ? String(row.company_id) : null;
  if (companyId) {
    const allowed = await canAccessCompany(admin, userId, companyId);
    if (!allowed) throw new Error('company_not_found_or_forbidden');
    return { companyId };
  }

  if (String(row.user_id) !== userId) throw new Error('company_not_found_or_forbidden');
  return { companyId: null };
}

async function filterSupplierInvoiceIdsForCompany(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  supplierInvoiceIds: string[],
): Promise<string[]> {
  const allowed = await canAccessCompany(admin, userId, companyId);
  if (!allowed) throw new Error('company_not_found_or_forbidden');

  const uniqueIds = [...new Set(supplierInvoiceIds.map(String).filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await admin
    .from('atlas_supplier_invoices')
    .select('id, company_id, user_id')
    .in('id', uniqueIds);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row: SupplierInvoiceScopeRow) => {
      if (row.company_id) return String(row.company_id) === companyId;
      return String(row.user_id) === userId;
    })
    .map((row: SupplierInvoiceScopeRow) => String(row.id));
}

async function findSupplierInvoiceByDocumentHint(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  documentId: string,
  invoiceNumber?: string | null,
): Promise<string | null> {
  const trimmedNumber = invoiceNumber?.trim() || null;

  let query = admin
    .from('atlas_supplier_invoices')
    .select('id')
    .eq('document_id', documentId)
    .eq('company_id', companyId);
  query = trimmedNumber ? query.eq('invoice_number', trimmedNumber) : query.is('invoice_number', null);

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.warn('[TVA] findSupplierInvoiceByDocumentHint failed', error.message);
    return null;
  }
  if (data?.id) return String(data.id);

  let legacyQuery = admin
    .from('atlas_supplier_invoices')
    .select('id')
    .eq('document_id', documentId)
    .is('company_id', null)
    .eq('user_id', userId);
  legacyQuery = trimmedNumber
    ? legacyQuery.eq('invoice_number', trimmedNumber)
    : legacyQuery.is('invoice_number', null);

  const { data: legacy, error: legacyError } = await legacyQuery
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyError) {
    console.warn('[TVA] findSupplierInvoiceByDocumentHint legacy failed', legacyError.message);
    return null;
  }

  return legacy?.id ? String(legacy.id) : null;
}

async function linkTvaSuggestionToSupplierInvoice(
  admin: SupabaseClient,
  companyId: string,
  suggestionId: string,
  supplierInvoiceId: string,
  currentSourceInvoiceId?: string | null,
): Promise<void> {
  if (currentSourceInvoiceId && String(currentSourceInvoiceId) === supplierInvoiceId) return;

  const { error } = await admin
    .from('zafirix_tva_suggestions')
    .update({
      source_invoice_id: supplierInvoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', suggestionId)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);
}

async function insertSupplierInvoiceFromTvaSuggestion(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  suggestion: TvaSuggestionLinkRow,
  identity?: { supplierIce: string; supplierIf: string },
): Promise<string> {
  const amountHt = Number(suggestion.base_ht ?? 0);
  const vatAmount = Number(suggestion.amount ?? 0);
  const totalTtc = amountHt + vatAmount;

  const payload = {
    user_id: userId,
    company_id: companyId,
    document_id: suggestion.source_document_id,
    source_document_id: suggestion.source_document_id,
    supplier_name: String(suggestion.supplier_name ?? '').trim() || 'Fournisseur',
    invoice_number: suggestion.invoice_number ? String(suggestion.invoice_number).trim() : null,
    invoice_date: suggestion.invoice_date,
    amount_ht: amountHt || null,
    vat_amount: vatAmount || null,
    amount_ttc: totalTtc || null,
    vat_rate: suggestion.rate != null ? Number(suggestion.rate) : null,
    supplier_ice: identity?.supplierIce ?? null,
    supplier_if: identity?.supplierIf ?? null,
    status: 'unpaid',
    validation_status: 'draft',
    generated_by: 'tva_identity_link',
    metadata: {
      linked_from_tva_suggestion_id: suggestion.id,
      generated_at: new Date().toISOString(),
    },
  };

  const { data, error } = await admin.from('atlas_supplier_invoices').insert(payload).select('id').single();

  if (error?.code === '23505') {
    const existingId = await findSupplierInvoiceByDocumentHint(
      admin,
      companyId,
      userId,
      suggestion.source_document_id,
      suggestion.invoice_number,
    );
    if (existingId) return existingId;
    throw new Error(error.message);
  }

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('supplier_invoice_create_failed');

  return String(data.id);
}

/** Resolve atlas_supplier_invoices id from TVA line links (never zafirix_tva_suggestions). */
export async function resolveSupplierInvoiceIdForTvaLine(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  opts: {
    sourceInvoiceId?: string | null;
    sourceDocumentId?: string | null;
    invoiceNumber?: string | null;
  },
): Promise<string | null> {
  const linkedId = opts.sourceInvoiceId ? String(opts.sourceInvoiceId).trim() : '';
  if (linkedId) {
    try {
      await assertSupplierInvoiceCompanyAccess(admin, userId, linkedId);
      return linkedId;
    } catch {
      return null;
    }
  }

  const documentId = opts.sourceDocumentId ? String(opts.sourceDocumentId).trim() : '';
  if (!documentId) return null;

  return findSupplierInvoiceByDocumentHint(admin, companyId, userId, documentId, opts.invoiceNumber);
}

/**
 * Ensure a suggestion has a linked atlas_supplier_invoices row.
 * Creates a draft supplier invoice when none exists, then links source_invoice_id.
 */
export async function ensureSupplierInvoiceForTvaSuggestion(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  suggestion: TvaSuggestionLinkRow,
): Promise<{ invoiceId: string; created: boolean }> {
  const allowed = await canAccessCompany(admin, userId, companyId);
  if (!allowed) throw new Error('company_not_found_or_forbidden');

  const existingId = await resolveSupplierInvoiceIdForTvaLine(admin, companyId, userId, {
    sourceInvoiceId: suggestion.source_invoice_id,
    sourceDocumentId: suggestion.source_document_id,
    invoiceNumber: suggestion.invoice_number,
  });

  if (existingId) {
    await linkTvaSuggestionToSupplierInvoice(
      admin,
      companyId,
      suggestion.id,
      existingId,
      suggestion.source_invoice_id,
    );
    return { invoiceId: existingId, created: false };
  }

  const invoiceId = await insertSupplierInvoiceFromTvaSuggestion(admin, companyId, userId, suggestion);
  await linkTvaSuggestionToSupplierInvoice(admin, companyId, suggestion.id, invoiceId, suggestion.source_invoice_id);
  return { invoiceId, created: true };
}

export async function ensureSupplierInvoiceIdsFromTvaSuggestions(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  suggestionIds: string[],
): Promise<{ invoiceIds: string[]; createdCount: number; notFoundCount: number }> {
  if (suggestionIds.length === 0) return { invoiceIds: [], createdCount: 0, notFoundCount: 0 };

  const allowed = await canAccessCompany(admin, userId, companyId);
  if (!allowed) throw new Error('company_not_found_or_forbidden');

  const { data, error } = await admin
    .from('zafirix_tva_suggestions')
    .select(
      'id, source_invoice_id, source_document_id, supplier_name, invoice_number, invoice_date, base_ht, amount, rate',
    )
    .in('id', suggestionIds)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);

  const resolved = new Set<string>();
  let createdCount = 0;
  const notFoundCount = suggestionIds.length - (data ?? []).length;

  for (const row of (data ?? []) as TvaSuggestionLinkRow[]) {
    const { invoiceId, created } = await ensureSupplierInvoiceForTvaSuggestion(
      admin,
      companyId,
      userId,
      row,
    );
    resolved.add(invoiceId);
    if (created) createdCount += 1;
  }

  return { invoiceIds: [...resolved], createdCount, notFoundCount };
}

/** @deprecated Use ensureSupplierInvoiceIdsFromTvaSuggestions — kept for callers expecting resolve-only semantics. */
export async function resolveSupplierInvoiceIdsFromTvaSuggestions(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  suggestionIds: string[],
): Promise<{ invoiceIds: string[]; unresolvedCount: number }> {
  const { invoiceIds, notFoundCount } = await ensureSupplierInvoiceIdsFromTvaSuggestions(
    admin,
    companyId,
    userId,
    suggestionIds,
  );
  return { invoiceIds, unresolvedCount: notFoundCount };
}

export async function updateSupplierInvoiceIdentity(
  admin: SupabaseClient,
  userId: string,
  supplierInvoiceId: string,
  supplierIce: string,
  supplierIf: string,
): Promise<void> {
  await assertSupplierInvoiceCompanyAccess(admin, userId, supplierInvoiceId);

  const { error } = await admin
    .from('atlas_supplier_invoices')
    .update({
      supplier_ice: supplierIce,
      supplier_if: supplierIf,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierInvoiceId);

  if (error) throw new Error(error.message);
}

export async function bulkUpdateSupplierInvoiceIdentity(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  supplierInvoiceIds: string[],
  supplierIce: string,
  supplierIf: string,
  batchSize = 50,
): Promise<number> {
  const allowedIds = await filterSupplierInvoiceIdsForCompany(
    admin,
    userId,
    companyId,
    supplierInvoiceIds,
  );
  if (allowedIds.length === 0) return 0;

  let updated = 0;
  const patch = {
    supplier_ice: supplierIce,
    supplier_if: supplierIf,
    updated_at: new Date().toISOString(),
  };

  for (let i = 0; i < allowedIds.length; i += batchSize) {
    const batch = allowedIds.slice(i, i + batchSize);
    const { error, count } = await admin.from('atlas_supplier_invoices').update(patch).in('id', batch);

    if (error) throw new Error(error.message);
    updated += count ?? batch.length;
  }

  return updated;
}
