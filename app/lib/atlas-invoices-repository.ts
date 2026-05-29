import type { AtlasInvoice } from '@/app/types/atlas-invoice';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import {
  requireClientInCompany,
  requireOwnedCompany,
  requireOwnedInvoice,
} from '@/app/lib/atlas-entity-ownership';

export function readInvoicesFromLocalStorage(): AtlasInvoice[] {
  if (blockCriticalLocalStorageInProduction('atlas_invoices')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.invoices);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasInvoice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeInvoicesToLocalStorage(invoices: AtlasInvoice[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_invoices')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.invoices, JSON.stringify(invoices));
}

function rowToInvoice(row: Record<string, unknown>): AtlasInvoice {
  const metadata = asRecord(row.metadata);
  return {
    id: String(row.id),
    number: String(row.number ?? ''),
    clientName: String(row.client_name ?? ''),
    issueDate: String(row.issue_date),
    paymentTerms: { kind: 'custom', days: Number(row.payment_terms_days ?? 30) },
    dueDate: String(row.due_date),
    status: (row.status ?? 'sent') as AtlasInvoice['status'],
    amountHT: Number(row.amount_ht ?? 0),
    vatRate: Number(row.vat_rate ?? 0),
    vatAmount: Number(row.vat_amount ?? 0),
    totalTTC: Number(row.total_ttc ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    ...(metadata ? ({ metadata } as Record<string, unknown>) : {}),
  } as AtlasInvoice;
}

export type ListAtlasInvoicesOptions = {
  /** When omitted in Supabase mode, scopes to the active company. */
  companyId?: string | null;
};

export async function listAtlasInvoices(opts?: ListAtlasInvoicesOptions): Promise<AtlasInvoice[]> {
  if (!isAtlasSupabaseDataEnabled()) return readInvoicesFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  let companyId = opts?.companyId;
  if (companyId === undefined) {
    companyId = await getActiveCompanyDbRowId();
  }
  if (!companyId) return [];

  const owned = await requireOwnedCompany(companyId);
  if (!owned.ok) return [];

  const { data, error } = await supabase
    .from('atlas_invoices')
    .select('*')
    .eq('company_id', companyId)
    .order('issue_date', { ascending: false });

  if (error) {
    logAtlasServerEvent('atlas_invoices', 'error', 'list_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => rowToInvoice(row as Record<string, unknown>));
}

export async function upsertAtlasInvoice(
  invoice: AtlasInvoice,
  opts?: { companyId?: string | null; clientId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readInvoicesFromLocalStorage();
    const next = existing.some((i) => i.id === invoice.id)
      ? existing.map((i) => (i.id === invoice.id ? invoice : i))
      : [...existing, invoice];
    writeInvoicesToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const companyId = (opts?.companyId ?? (await getActiveCompanyDbRowId()))?.trim() || null;
  if (!companyId) return { ok: false, error: 'company_required' };

  const ownedCompany = await requireOwnedCompany(companyId);
  if (!ownedCompany.ok) return { ok: false, error: ownedCompany.error };

  if (opts?.clientId) {
    const clientOk = await requireClientInCompany(opts.clientId, companyId);
    if (!clientOk.ok) return { ok: false, error: clientOk.error };
  }

  if (typeof invoice.id === 'string') {
    const ownedInvoice = await requireOwnedInvoice(invoice.id, companyId);
    if (!ownedInvoice.ok) return { ok: false, error: ownedInvoice.error };
  }

  const row = {
    user_id: auth.userId,
    company_id: companyId,
    client_id: opts?.clientId ?? null,
    number: invoice.number,
    client_name: invoice.clientName,
    issue_date: invoice.issueDate,
    payment_terms_days: invoice.paymentTerms.days ?? 30,
    due_date: invoice.dueDate,
    amount_ht: invoice.amountHT,
    vat_rate: invoice.vatRate,
    vat_amount: invoice.vatAmount,
    total_ttc: invoice.totalTTC,
    status: invoice.status,
    metadata: (invoice as AtlasInvoice & { metadata?: unknown }).metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  if (typeof invoice.id === 'string') {
    const { error } = await supabase
      .from('atlas_invoices')
      .update(row)
      .eq('id', invoice.id)
      .eq('user_id', auth.userId)
      .eq('company_id', companyId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('atlas_invoices').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAtlasInvoice(
  id: AtlasInvoice['id'],
  opts?: { companyId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    writeInvoicesToLocalStorage(readInvoicesFromLocalStorage().filter((inv) => inv.id !== id));
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  if (typeof id !== 'string') return { ok: false, error: 'invalid_id' };

  const companyId = opts?.companyId ?? (await getActiveCompanyDbRowId());
  const ownedInvoice = await requireOwnedInvoice(id, companyId ?? undefined);
  if (!ownedInvoice.ok) return { ok: false, error: ownedInvoice.error };

  let query = supabase.from('atlas_invoices').delete().eq('id', id).eq('user_id', auth.userId);
  if (companyId) query = query.eq('company_id', companyId);

  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function atlasInvoiceErrorMessage(code: string): string {
  switch (code) {
    case 'auth_required':
      return 'Connectez-vous pour gérer vos factures.';
    case 'company_required':
      return 'Sélectionnez une société active avant de créer une facture.';
    case 'company_not_found_or_forbidden':
      return 'Société active introuvable ou non autorisée.';
    case 'client_company_mismatch':
      return 'Ce client n’appartient pas à la société active.';
    case 'invoice_not_found_or_forbidden':
      return 'Cette facture est introuvable ou ne vous appartient pas.';
    case 'invoice_company_mismatch':
      return 'Cette facture n’appartient pas à la société active.';
    case 'invalid_id':
      return 'Identifiant de facture invalide.';
    default:
      return code || 'Une erreur est survenue. Réessayez.';
  }
}
