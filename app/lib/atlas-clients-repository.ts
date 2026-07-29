/**
 * Data-access boundary for clients: `local` mode uses browser storage; with
 * `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`, reads `public.atlas_clients` only (no silent local fallback).
 */

import type { AtlasClient } from '@/app/types/atlas-client';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import { asRecord } from '@/app/lib/atlas-json';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { requireOwnedClient, requireOwnedCompany } from '@/app/lib/atlas-entity-ownership';

const CLIENT_SELECT =
  'id, user_id, company_id, name, email, phone, address, city, payment_terms_days, balance_mad, metadata, created_at, updated_at';

type AtlasClientRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  payment_terms_days: number;
  balance_mad: number | string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export function readClientsFromLocalStorage(): AtlasClient[] {
  if (blockCriticalLocalStorageInProduction('atlas_clients')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.clients);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasClient[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeClientsToLocalStorage(clients: AtlasClient[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_clients')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.clients, JSON.stringify(clients));
}

function rowToClient(row: AtlasClientRow): AtlasClient {
  const metadata = asRecord(row.metadata);
  return {
    id: String(row.id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    name: String(row.name ?? '').trim(),
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    paymentTerms: { kind: 'custom', days: Number(row.payment_terms_days ?? 30) },
    balance: Number(row.balance_mad ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    ...(metadata ? ({ metadata } as Record<string, unknown>) : {}),
  } as AtlasClient;
}

function clientRowPayload(
  client: AtlasClient,
  userId: string,
  companyId: string,
): Record<string, unknown> {
  return {
    user_id: userId,
    company_id: companyId,
    name: client.name.trim(),
    email: client.email?.trim() || null,
    phone: client.phone?.trim() || null,
    address: client.address?.trim() || null,
    city: client.city?.trim() || null,
    payment_terms_days: client.paymentTerms?.days ?? 30,
    balance_mad: client.balance ?? 0,
    metadata: (client as AtlasClient & { metadata?: unknown }).metadata ?? {},
    updated_at: new Date().toISOString(),
  };
}

export type ListAtlasClientsOptions = {
  /** When set, returns clients scoped to this company (must belong to current user). */
  companyId?: string | null;
};

export async function listAtlasClients(opts?: ListAtlasClientsOptions): Promise<AtlasClient[]> {
  if (!isAtlasSupabaseDataEnabled()) return readClientsFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  let query = supabase.from('atlas_clients').select(CLIENT_SELECT).order('created_at', { ascending: true });

  if (opts?.companyId) {
    const owned = await requireOwnedCompany(opts.companyId);
    if (!owned.ok) return [];
    query = query.or(`company_id.eq.${opts.companyId},company_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    logAtlasServerEvent('atlas_clients', 'error', 'list_failed', { message: error.message });
    return [];
  }

  return (data ?? [])
    .map((row) => rowToClient(row as AtlasClientRow))
    .filter((c) => c.name.length > 0);
}

export async function upsertAtlasClient(
  client: AtlasClient,
  opts: { companyId: string; isUpdate?: boolean },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readClientsFromLocalStorage();
    const next = existing.some((c) => c.id === client.id)
      ? existing.map((c) => (c.id === client.id ? client : c))
      : [...existing, client];
    writeClientsToLocalStorage(next);
    return { ok: true, id: String(client.id) };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const name = client.name.trim();
  if (!name) return { ok: false, error: 'name_required' };

  const companyId = opts.companyId.trim();
  if (!companyId) return { ok: false, error: 'company_required' };

  const ownedCompany = await requireOwnedCompany(companyId);
  if (!ownedCompany.ok) return { ok: false, error: ownedCompany.error };

  const row = clientRowPayload({ ...client, name }, auth.userId, companyId);

  if (opts.isUpdate && typeof client.id === 'string') {
    const ownedClient = await requireOwnedClient(client.id);
    if (!ownedClient.ok) return { ok: false, error: ownedClient.error };

    const { error } = await supabase
      .from('atlas_clients')
      .update(row)
      .eq('id', client.id)
      .eq('user_id', auth.userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: client.id };
  }

  const { data, error } = await supabase
    .from('atlas_clients')
    .insert(row)
    .select('id')
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, id: String(data.id) };
}

export async function deleteAtlasClient(id: AtlasClient['id']): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    writeClientsToLocalStorage(readClientsFromLocalStorage().filter((c) => c.id !== id));
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  if (typeof id !== 'string') return { ok: false, error: 'invalid_id' };

  const owned = await requireOwnedClient(id);
  if (!owned.ok) return { ok: false, error: owned.error };

  const { error } = await supabase.from('atlas_clients').delete().eq('id', id).eq('user_id', auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Maps repository errors to user-facing French messages. */
export function atlasClientErrorMessage(code: string): string {
  switch (code) {
    case 'auth_required':
      return 'Connectez-vous pour gérer vos clients.';
    case 'company_required':
      return 'Sélectionnez une société active avant d’ajouter un client.';
    case 'company_not_found_or_forbidden':
      return 'Société active introuvable ou non autorisée.';
    case 'client_not_found_or_forbidden':
      return 'Ce client est introuvable ou ne vous appartient pas.';
    case 'name_required':
      return 'Le nom du client est obligatoire.';
    case 'invalid_id':
      return 'Identifiant client invalide.';
    default:
      return code || 'Une erreur est survenue. Réessayez.';
  }
}
