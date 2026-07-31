import { isValidIce, isValidIf } from '@/app/lib/atlas-morocco-compliance';
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

/** Resolve atlas_supplier_invoices id from TVA line links (never zafirix_tva_suggestions). */
export async function resolveSupplierInvoiceIdForTvaLine(
  admin: SupabaseClient,
  userId: string,
  opts: {
    sourceInvoiceId?: string | null;
    sourceDocumentId?: string | null;
  },
): Promise<string | null> {
  const linkedId = opts.sourceInvoiceId ? String(opts.sourceInvoiceId).trim() : '';
  if (linkedId) return linkedId;

  const documentId = opts.sourceDocumentId ? String(opts.sourceDocumentId).trim() : '';
  if (!documentId) return null;

  const { data, error } = await admin
    .from('atlas_supplier_invoices')
    .select('id')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[TVA] resolveSupplierInvoiceIdForTvaLine failed', error.message);
    return null;
  }

  return data?.id ? String(data.id) : null;
}

export async function resolveSupplierInvoiceIdsFromTvaSuggestions(
  admin: SupabaseClient,
  userId: string,
  suggestionIds: string[],
): Promise<{ invoiceIds: string[]; unresolvedCount: number }> {
  if (suggestionIds.length === 0) return { invoiceIds: [], unresolvedCount: 0 };

  const { data, error } = await admin
    .from('zafirix_tva_suggestions')
    .select('id, source_invoice_id, source_document_id')
    .in('id', suggestionIds)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  const resolved = new Set<string>();
  let unresolvedCount = 0;

  for (const row of data ?? []) {
    const invoiceId = await resolveSupplierInvoiceIdForTvaLine(admin, userId, {
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
  const { error } = await admin
    .from('atlas_supplier_invoices')
    .update({
      supplier_ice: supplierIce,
      supplier_if: supplierIf,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierInvoiceId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function bulkUpdateSupplierInvoiceIdentity(
  admin: SupabaseClient,
  userId: string,
  supplierInvoiceIds: string[],
  supplierIce: string,
  supplierIf: string,
  batchSize = 50,
): Promise<number> {
  const uniqueIds = [...new Set(supplierInvoiceIds.map(String).filter(Boolean))];
  if (uniqueIds.length === 0) return 0;

  let updated = 0;
  const patch = {
    supplier_ice: supplierIce,
    supplier_if: supplierIf,
    updated_at: new Date().toISOString(),
  };

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const { error, count } = await admin
      .from('atlas_supplier_invoices')
      .update(patch)
      .in('id', batch)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    updated += count ?? batch.length;
  }

  return updated;
}
