/**
 * Application-layer ownership helpers (RLS remains authoritative on Supabase).
 * Shared workspace resources are scoped by company_id + canAccessCompany.
 */

import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { canAccessCompany } from '@/app/lib/atlas-permissions';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { supabase } from '@/app/lib/supabase';

export type OwnershipAuth = { ok: true; userId: string } | { ok: false; error: string };

export async function requireEntityOwner(): Promise<OwnershipAuth> {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };
  return { ok: true, userId: auth.userId };
}

async function assertCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  return canAccessCompany(supabase, userId, companyId);
}

/** Verifies the signed-in user may access the company workspace. */
export async function requireOwnedCompany(
  dbRowId: string,
): Promise<OwnershipAuth & { companyId?: string }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, companyId: dbRowId };
  }

  const allowed = await assertCompanyAccess(auth.userId, dbRowId);
  if (!allowed) {
    return { ok: false, error: 'company_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, companyId: dbRowId };
}

/** Verifies the client row belongs to an accessible company workspace. */
export async function requireOwnedClient(
  clientId: string,
): Promise<OwnershipAuth & { clientId?: string; companyId?: string | null }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, clientId };
  }

  const { data, error } = await supabase
    .from('atlas_clients')
    .select('id, company_id, user_id')
    .eq('id', clientId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'client_not_found_or_forbidden' };
  }

  const companyId = data.company_id ? String(data.company_id) : null;
  if (companyId) {
    if (!(await assertCompanyAccess(auth.userId, companyId))) {
      return { ok: false, error: 'client_not_found_or_forbidden' };
    }
  } else if (String(data.user_id) !== auth.userId) {
    return { ok: false, error: 'client_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, clientId: data.id, companyId };
}

/** Verifies the document row belongs to an accessible company workspace. */
export async function requireOwnedDocument(
  documentId: string,
): Promise<OwnershipAuth & { documentId?: string; companyId?: string | null }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, documentId };
  }

  const { data, error } = await supabase
    .from('atlas_documents')
    .select('id, company_id, user_id')
    .eq('id', documentId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'document_not_found_or_forbidden' };
  }

  const companyId = data.company_id ? String(data.company_id) : null;
  if (companyId) {
    if (!(await assertCompanyAccess(auth.userId, companyId))) {
      return { ok: false, error: 'document_not_found_or_forbidden' };
    }
  } else if (String(data.user_id) !== auth.userId) {
    return { ok: false, error: 'document_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, documentId: data.id, companyId };
}

/** Verifies the invoice row belongs to an accessible company workspace. */
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
    .select('id, company_id, user_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'invoice_not_found_or_forbidden' };
  }

  const rowCompanyId = data.company_id ? String(data.company_id) : null;
  if (rowCompanyId) {
    if (!(await assertCompanyAccess(auth.userId, rowCompanyId))) {
      return { ok: false, error: 'invoice_not_found_or_forbidden' };
    }
  } else if (String(data.user_id) !== auth.userId) {
    return { ok: false, error: 'invoice_not_found_or_forbidden' };
  }

  if (companyId && rowCompanyId && rowCompanyId !== companyId) {
    return { ok: false, error: 'invoice_company_mismatch' };
  }

  return { ok: true, userId: auth.userId, invoiceId: data.id, companyId: rowCompanyId };
}

/** Verifies a client row belongs to the target company workspace. */
export async function requireClientInCompany(
  clientId: string,
  companyId: string,
): Promise<OwnershipAuth> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId };
  }

  const companyOk = await requireOwnedCompany(companyId);
  if (!companyOk.ok) return companyOk;

  const { data, error } = await supabase
    .from('atlas_clients')
    .select('id, company_id')
    .eq('id', clientId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'client_not_found_or_forbidden' };
  }
  if (data.company_id && data.company_id !== companyId) {
    return { ok: false, error: 'client_company_mismatch' };
  }

  return { ok: true, userId: auth.userId };
}

/** Verifies the supplier invoice row belongs to an accessible company workspace. */
export async function requireOwnedSupplierInvoice(
  supplierInvoiceId: string,
): Promise<OwnershipAuth & { supplierInvoiceId?: string; companyId?: string | null }> {
  const auth = await requireEntityOwner();
  if (!auth.ok) return auth;

  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true, userId: auth.userId, supplierInvoiceId };
  }

  const { data, error } = await supabase
    .from('atlas_supplier_invoices')
    .select('id, company_id, user_id')
    .eq('id', supplierInvoiceId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'supplier_invoice_not_found_or_forbidden' };
  }

  const companyId = data.company_id ? String(data.company_id) : null;
  if (companyId) {
    if (!(await assertCompanyAccess(auth.userId, companyId))) {
      return { ok: false, error: 'supplier_invoice_not_found_or_forbidden' };
    }
  } else if (String(data.user_id) !== auth.userId) {
    return { ok: false, error: 'supplier_invoice_not_found_or_forbidden' };
  }

  return { ok: true, userId: auth.userId, supplierInvoiceId: data.id, companyId };
}
