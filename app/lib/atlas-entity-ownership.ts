/**
 * Application-layer ownership helpers (RLS remains authoritative on Supabase).
 */

import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { supabase } from '@/app/lib/supabase';

export type OwnershipAuth = { ok: true; userId: string } | { ok: false; error: string };

export async function requireEntityOwner(): Promise<OwnershipAuth> {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };
  return { ok: true, userId: auth.userId };
}

/** Verifies the company row belongs to the signed-in user (Sprint A). */
export async function requireOwnedCompany(
  dbRowId: string,
): Promise<OwnershipAuth & { companyId?: string }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, companyId: dbRowId };
  }

  const { data, error } = await supabase
    .from('atlas_companies')
    .select('id')
    .eq('id', dbRowId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'company_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, companyId: data.id };
}

/** Verifies the client row belongs to the signed-in user (Sprint C). */
export async function requireOwnedClient(
  clientId: string,
): Promise<OwnershipAuth & { clientId?: string }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, clientId };
  }

  const { data, error } = await supabase
    .from('atlas_clients')
    .select('id')
    .eq('id', clientId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'client_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, clientId: data.id };
}

/** Verifies the document row belongs to the signed-in user (Sprint D-alt). */
export async function requireOwnedDocument(
  documentId: string,
): Promise<OwnershipAuth & { documentId?: string }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, documentId };
  }

  const { data, error } = await supabase
    .from('atlas_documents')
    .select('id')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'document_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, documentId: data.id };
}

/** Verifies the invoice row belongs to the signed-in user (optionally same company). */
export async function requireOwnedInvoice(
  invoiceId: string,
  companyId?: string | null,
): Promise<OwnershipAuth & { invoiceId?: string; companyId?: string | null }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, invoiceId, companyId: companyId ?? null };
  }

  const { data, error } = await supabase
    .from('atlas_invoices')
    .select('id, company_id')
    .eq('id', invoiceId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'invoice_not_found_or_forbidden' };
  }

  if (companyId && data.company_id !== companyId) {
    return { ok: false, error: 'invoice_company_mismatch' };
  }

  return { ok: true, userId: auth.userId, invoiceId: data.id, companyId: data.company_id ?? null };
}

/** Verifies a client row belongs to the signed-in user and target company. */
export async function requireClientInCompany(
  clientId: string,
  companyId: string,
): Promise<OwnershipAuth> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId };
  }

  const { data, error } = await supabase
    .from('atlas_clients')
    .select('id, company_id')
    .eq('id', clientId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error || !data?.id || data.company_id !== companyId) {
    return { ok: false, error: 'client_company_mismatch' };
  }

  return { ok: true, userId: auth.userId };
}

/** Verifies the supplier invoice row belongs to the signed-in user (Sprint E). */
export async function requireOwnedSupplierInvoice(
  supplierInvoiceId: string,
): Promise<OwnershipAuth & { supplierInvoiceId?: string }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, supplierInvoiceId };
  }

  const { data, error } = await supabase
    .from('atlas_supplier_invoices')
    .select('id')
    .eq('id', supplierInvoiceId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'supplier_invoice_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, supplierInvoiceId: data.id };
}
