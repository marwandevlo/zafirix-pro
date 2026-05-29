/**
 * Data-access boundary for payments: `local` mode uses browser storage; with
 * `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`, reads `public.atlas_payments` only.
 */

import type { AtlasPayment } from '@/app/types/atlas-payment';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';

const PAYMENTS_BASELINE_MIGRATION = 'supabase/migrations/ensure_atlas_payments_baseline.sql';

let devMissingTableWarned = false;

export function isAtlasPaymentsTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('atlas_payments') &&
    (m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find'))
  );
}

function warnPaymentsTableMissingOnce(): void {
  if (process.env.NODE_ENV !== 'development' || devMissingTableWarned) return;
  devMissingTableWarned = true;
  console.warn(
    `[atlas_payments] Table missing. Run ${PAYMENTS_BASELINE_MIGRATION} in Supabase SQL Editor.`,
  );
}

function rowPaidAmount(row: Record<string, unknown>): number {
  if (typeof row.paid_amount === 'number' || typeof row.paid_amount === 'string') {
    return Number(row.paid_amount);
  }
  if (typeof row.amount === 'number' || typeof row.amount === 'string') {
    return Number(row.amount);
  }
  return 0;
}

export function readPaymentsFromLocalStorage(): AtlasPayment[] {
  if (blockCriticalLocalStorageInProduction('atlas_payments')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.payments);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasPayment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePaymentsToLocalStorage(payments: AtlasPayment[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_payments')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.payments, JSON.stringify(payments));
}

export async function listAtlasPayments(params?: { invoiceId?: string }): Promise<AtlasPayment[]> {
  if (!isAtlasSupabaseDataEnabled()) return readPaymentsFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  let q = supabase.from('atlas_payments').select('*').order('created_at', { ascending: true });
  if (params?.invoiceId) q = q.eq('invoice_id', params.invoiceId);

  const { data, error } = await q;
  if (error) {
    if (isAtlasPaymentsTableMissingError(error.message)) {
      warnPaymentsTableMissingOnce();
      return [];
    }
    logAtlasServerEvent('atlas_payments', 'error', 'list_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const metadata = asRecord(row.metadata);
    return {
      id: String(row.id),
      companyId: row.company_id != null ? String(row.company_id) : null,
      invoiceId: row.invoice_id != null ? String(row.invoice_id) : '',
      paidAmount: rowPaidAmount(row),
      paidAt: row.paid_at != null ? String(row.paid_at) : undefined,
      note: typeof row.note === 'string' ? row.note : undefined,
      metadata,
      createdAt: row.created_at != null ? String(row.created_at) : new Date().toISOString(),
      updatedAt: row.updated_at != null ? String(row.updated_at) : new Date().toISOString(),
    } satisfies AtlasPayment;
  });
}

export async function upsertAtlasPayment(payment: AtlasPayment): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readPaymentsFromLocalStorage();
    const next = existing.some((p) => p.id === payment.id)
      ? existing.map((p) => (p.id === payment.id ? payment : p))
      : [...existing, payment];
    writePaymentsToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const paidAmount = payment.paidAmount ?? 0;
  const { error } = await supabase.from('atlas_payments').upsert({
    id: payment.id,
    user_id: auth.userId,
    company_id: payment.companyId ?? null,
    invoice_id: payment.invoiceId || null,
    amount: paidAmount,
    paid_amount: paidAmount,
    currency: 'MAD',
    status: 'completed',
    paid_at: payment.paidAt ?? null,
    note: payment.note ?? null,
    metadata: payment.metadata ?? {},
    updated_at: new Date().toISOString(),
  });

  if (error) {
    if (isAtlasPaymentsTableMissingError(error.message)) {
      warnPaymentsTableMissingOnce();
      return { ok: false, error: 'payments_table_missing' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteAtlasPayment(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    writePaymentsToLocalStorage(readPaymentsFromLocalStorage().filter((p) => p.id !== id));
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase.from('atlas_payments').delete().eq('id', id);
  if (error) {
    if (isAtlasPaymentsTableMissingError(error.message)) {
      warnPaymentsTableMissingOnce();
      return { ok: false, error: 'payments_table_missing' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
