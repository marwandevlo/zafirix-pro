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

/** Resolve atlas_supplier_invoices id from TVA line links (never zafirix_tva_suggestions). */
export async function resolveSupplierInvoiceIdForTvaLine(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  opts: {
    sourceInvoiceId?: string | null;
    sourceDocumentId?: string | null;
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

  const { data, error } = await admin
    .from('atlas_supplier_invoices')
    .select('id')
    .eq('document_id', documentId)
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[TVA] resolveSupplierInvoiceIdForTvaLine failed', error.message);
    return null;
  }

  if (data?.id) return String(data.id);

  const { data: legacy, error: legacyError } = await admin
    .from('atlas_supplier_invoices')
    .select('id')
    .eq('document_id', documentId)
    .is('company_id', null)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyError) {
    console.warn('[TVA] resolveSupplierInvoiceIdForTvaLine legacy failed', legacyError.message);
    return null;
  }

  return legacy?.id ? String(legacy.id) : null;
}

export async function resolveSupplierInvoiceIdsFromTvaSuggestions(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  suggestionIds: string[],
): Promise<{ invoiceIds: string[]; unresolvedCount: number }> {
  if (suggestionIds.length === 0) return { invoiceIds: [], unresolvedCount: 0 };

  const allowed = await canAccessCompany(admin, userId, companyId);
  if (!allowed) throw new Error('company_not_found_or_forbidden');

  const { data, error } = await admin
    .from('zafirix_tva_suggestions')
    .select('id, source_invoice_id, source_document_id')
    .in('id', suggestionIds)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);

  const resolved = new Set<string>();
  let unresolvedCount = suggestionIds.length - (data ?? []).length;

  for (const row of data ?? []) {
    const invoiceId = await resolveSupplierInvoiceIdForTvaLine(admin, companyId, userId, {
      sourceInvoiceId: (row as { source_invoice_id?: string | null }).source_invoice_id,
      sourceDocumentId: (row as { source_document_id?: string | null }).source_document_id,
    });
    if (invoiceId) resolved.add(invoiceId);
    else unresolvedCount += 1;
  }

  return { invoiceIds: [...resolved], unresolvedCount };
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
