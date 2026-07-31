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

/** Mirror supplier ICE/IF onto a linked atlas_supplier_invoices row when present. */
export async function syncLinkedSupplierInvoiceIdentity(
  admin: SupabaseClient,
  userId: string,
  sourceInvoiceId: string | null | undefined,
  supplierIce: string,
  supplierIf: string,
): Promise<void> {
  const linkedId = sourceInvoiceId ? String(sourceInvoiceId).trim() : '';
  if (!linkedId) return;

  await admin
    .from('atlas_supplier_invoices')
    .update({
      supplier_ice: supplierIce,
      supplier_if: supplierIf,
      updated_at: new Date().toISOString(),
    })
    .eq('id', linkedId)
    .eq('user_id', userId);
}
