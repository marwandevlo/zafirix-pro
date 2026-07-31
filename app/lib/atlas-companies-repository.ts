/**
 * Data-access boundary for companies: `local` mode uses browser storage; with
 * `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`, reads `public.atlas_companies` only (no silent local fallback).
 */

import type { AtlasCompany } from '@/app/types/atlas-company';
import { supabase } from '@/app/lib/supabase';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import { requireOwnedCompany } from '@/app/lib/atlas-entity-ownership';

type AtlasCompanyRow = {
  id: string;
  user_id: string;
  name: string;
  legal_form: string | null;
  if_fiscal: string | null;
  ice: string | null;
  rc: string | null;
  company_json: unknown;
  legacy_local_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  legal_name?: string | null;
  trade_name?: string | null;
  if_number?: string | null;
  cnss_number?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  status?: string | null;
  workspace_id?: string | null;
};

const COMPANY_SELECT =
  'id, user_id, name, legal_form, if_fiscal, ice, rc, company_json, legacy_local_id, is_active, created_at, updated_at, legal_name, trade_name, if_number, cnss_number, address, city, country, phone, email, website, logo_url, status, workspace_id';

export function readCompaniesFromLocalStorage(): AtlasCompany[] {
  if (blockCriticalLocalStorageInProduction('atlas_companies')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.companies);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasCompany[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCompaniesToLocalStorage(companies: AtlasCompany[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_companies')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.companies, JSON.stringify(companies));
}

export function readActiveCompanyFromLocalStorage(): Partial<AtlasCompany> | null {
  if (blockCriticalLocalStorageInProduction('atlas_active_company')) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.activeCompany);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<AtlasCompany>;
  } catch {
    return null;
  }
}

function rowToCompany(row: AtlasCompanyRow): AtlasCompany {
  const j =
    row.company_json && typeof row.company_json === 'object'
      ? (row.company_json as Partial<AtlasCompany>)
      : {};
  const raisonSociale = (row.name || j.raisonSociale || '').trim();
  return {
    cnss: j.cnss ?? '',
    adresse: j.adresse ?? '',
    ville: j.ville ?? '',
    telephone: j.telephone ?? '',
    email: j.email ?? '',
    activite: j.activite ?? '',
    regimeTVA: j.regimeTVA ?? 'mensuel',
    paymentTerms: j.paymentTerms,
    balance: j.balance,
    ...j,
    dbRowId: row.id,
    id: row.id,
    raisonSociale,
    formeJuridique: row.legal_form || j.formeJuridique || '',
    if_fiscal: row.if_fiscal || j.if_fiscal || '',
    ice: row.ice || j.ice || '',
    rc: row.rc || j.rc || '',
    actif: row.is_active,
    legalName: row.legal_name ?? j.legalName ?? raisonSociale,
    tradeName: row.trade_name ?? j.tradeName ?? raisonSociale,
    country: row.country ?? j.country ?? 'MA',
    website: row.website ?? j.website ?? '',
    logoUrl: row.logo_url ?? j.logoUrl ?? '',
    status: (row.status ?? (j as { status?: string }).status ?? 'active') as AtlasCompany['status'],
    workspaceId: row.workspace_id ?? j.workspaceId ?? null,
  };
}

function companyJsonForRow(company: AtlasCompany): Record<string, unknown> {
  const { dbRowId: _d, ...rest } = company;
  return { ...rest } as Record<string, unknown>;
}

function companyRowPayload(company: AtlasCompany): {
  name: string;
  legal_form: string | null;
  if_fiscal: string | null;
  ice: string | null;
  rc: string | null;
  company_json: Record<string, unknown>;
  is_active: boolean;
  legacy_local_id: number | null;
  updated_at: string;
  legal_name: string | null;
  trade_name: string | null;
  if_number: string | null;
  cnss_number: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
} {
  const ext = company as AtlasCompany & Record<string, string | undefined>;
  const name = (company.raisonSociale || '').trim();
  const legal_form = company.formeJuridique?.trim() || null;
  const if_fiscal = company.if_fiscal?.trim() || null;
  const ice = company.ice?.trim() || null;
  const rc = company.rc?.trim() || null;
  const company_json = {
    ...companyJsonForRow(company),
    raisonSociale: name,
    formeJuridique: legal_form ?? company.formeJuridique ?? '',
    if_fiscal: if_fiscal ?? company.if_fiscal ?? '',
    ice: ice ?? company.ice ?? '',
    rc: rc ?? company.rc ?? '',
  };
  return {
    name: name || 'Sans nom',
    legal_form,
    if_fiscal,
    ice,
    rc,
    company_json,
    is_active: company.actif,
    legacy_local_id: typeof company.id === 'number' ? company.id : null,
    updated_at: new Date().toISOString(),
    legal_name: (ext.legalName ?? name) || null,
    trade_name: (ext.tradeName ?? name) || null,
    if_number: if_fiscal,
    cnss_number: company.cnss?.trim() || null,
    address: company.adresse?.trim() || null,
    city: company.ville?.trim() || null,
    country: ext.country?.trim() || 'MA',
    phone: company.telephone?.trim() || null,
    email: company.email?.trim() || null,
    website: ext.website?.trim() || null,
    logo_url: ext.logoUrl?.trim() || null,
  };
}

/** Ensures exactly one active company when rows exist; clears stale active flags. */
export async function ensureValidActiveCompany(): Promise<void> {
  if (!isAtlasSupabaseDataEnabled()) return;

  const auth = await requireSupabaseUser();
  if (!auth.ok) return;

  const { data, error } = await supabase
    .from('atlas_companies')
    .select('id, is_active')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: true });

  if (error) {
    logAtlasServerEvent('atlas_companies', 'error', 'ensure_active_list_failed', { message: error.message });
    return;
  }

  if (!data?.length) {
    await supabase
      .from('atlas_companies')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', auth.userId);
    return;
  }

  const activeRows = data.filter((row) => row.is_active);
  if (activeRows.length === 1) return;

  const targetId = activeRows[0]?.id ?? data[0].id;
  await setActiveAtlasCompany(targetId);
}

/**
 * Lists companies for the signed-in user. When `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`,
 * reads from `public.atlas_companies`; otherwise returns localStorage snapshot.
 */
export async function listAtlasCompanies(): Promise<AtlasCompany[]> {
  if (!isAtlasSupabaseDataEnabled()) {
    return readCompaniesFromLocalStorage();
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  const { data, error } = await supabase
    .from('atlas_companies')
    .select(COMPANY_SELECT)
    .order('created_at', { ascending: true });

  if (error) {
    logAtlasServerEvent('atlas_companies', 'error', 'list_failed', { message: error.message });
    return [];
  }

  return (data ?? [])
    .map((row) => rowToCompany(row as AtlasCompanyRow))
    .filter((c) => c.raisonSociale.trim().length > 0);
}

export async function upsertAtlasCompany(
  company: AtlasCompany,
): Promise<{ ok: true; dbRowId: string } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readCompaniesFromLocalStorage();
    const next = company.dbRowId
      ? existing.map((c) =>
          c.dbRowId === company.dbRowId || String(c.id) === String(company.dbRowId) ? company : c,
        )
      : existing.some((c) => c.id === company.id)
        ? existing.map((c) => (c.id === company.id ? company : c))
        : [...existing, company];
    writeCompaniesToLocalStorage(next);
    return { ok: true, dbRowId: company.dbRowId ?? String(company.id) };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const payload = companyRowPayload(company);
  if (!payload.name.trim()) return { ok: false, error: 'name_required' };

  if (company.dbRowId) {
    const owned = await requireOwnedCompany(company.dbRowId);
    if (!owned.ok) return { ok: false, error: owned.error };

    const { error } = await supabase
      .from('atlas_companies')
      .update(payload)
      .eq('id', company.dbRowId)
      .eq('user_id', auth.userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, dbRowId: company.dbRowId };
  }

  const { data, error } = await supabase
    .from('atlas_companies')
    .insert({
      user_id: auth.userId,
      ...payload,
    })
    .select('id')
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, dbRowId: String(data.id) };
}

export async function deleteAtlasCompany(dbRowId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    writeCompaniesToLocalStorage(
      readCompaniesFromLocalStorage().filter((c) => c.dbRowId !== dbRowId && c.id !== dbRowId),
    );
    return { ok: true };
  }

  const owned = await requireOwnedCompany(dbRowId);
  if (!owned.ok) return { ok: false, error: owned.error };

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { data: row } = await supabase
    .from('atlas_companies')
    .select('is_active')
    .eq('id', dbRowId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  const { error } = await supabase.from('atlas_companies').delete().eq('id', dbRowId).eq('user_id', auth.userId);
  if (error) return { ok: false, error: error.message };

  if (row?.is_active) {
    await ensureValidActiveCompany();
  }

  return { ok: true };
}

/** Marks one company active for the current user; others inactive. Pass `null` to deactivate all. */
export async function setActiveAtlasCompany(
  activeDbRowId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  if (activeDbRowId) {
    const owned = await requireOwnedCompany(activeDbRowId);
    if (!owned.ok) return { ok: false, error: owned.error };
  }

  const { error: offErr } = await supabase
    .from('atlas_companies')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', auth.userId);
  if (offErr) return { ok: false, error: offErr.message };

  if (activeDbRowId) {
    const { error: onErr } = await supabase
      .from('atlas_companies')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', activeDbRowId)
      .eq('user_id', auth.userId);
    if (onErr) return { ok: false, error: onErr.message };
  }

  return { ok: true };
}

/** Maps repository errors to user-facing French messages. */
export function atlasCompanyErrorMessage(code: string): string {
  switch (code) {
    case 'auth_required':
      return 'Connectez-vous pour gérer vos sociétés.';
    case 'company_not_found_or_forbidden':
      return 'Cette société est introuvable ou ne vous appartient pas.';
    case 'name_required':
      return 'La raison sociale est obligatoire.';
    case 'supabase_required':
      return 'La persistance cloud est requise pour cette action.';
    default:
      return code || 'Une erreur est survenue. Réessayez.';
  }
}

function readJsonArray(key: string): Record<string, unknown>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, rows: Record<string, unknown>[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(rows));
}

function rowBelongsToCompany(row: Record<string, unknown>, companyDbRowId: string): boolean {
  const cid = row.company_id ?? row.companyId ?? row.dbRowId;
  return cid != null && String(cid) === companyDbRowId;
}

/** Local mode: purge transactional keys for one company; keep company profile in atlas_companies. */
export function clearLocalCompanyData(companyDbRowId: string): void {
  if (blockCriticalLocalStorageInProduction('clear_company_data')) return;

  for (const key of [
    ATLAS_STORAGE_KEYS.accountingEntries,
    ATLAS_STORAGE_KEYS.clients,
    ATLAS_STORAGE_KEYS.invoices,
    ATLAS_STORAGE_KEYS.supplierInvoices,
    ATLAS_STORAGE_KEYS.payments,
    ATLAS_STORAGE_KEYS.documents,
    ATLAS_STORAGE_KEYS.employees,
    ATLAS_STORAGE_KEYS.projects,
    ATLAS_STORAGE_KEYS.links,
  ] as const) {
    const kept = readJsonArray(key).filter((row) => !rowBelongsToCompany(row, companyDbRowId));
    writeJsonArray(key, kept);
  }

  const companies = readCompaniesFromLocalStorage().map((c) =>
    c.dbRowId === companyDbRowId || String(c.id) === companyDbRowId
      ? { ...c, balance: 0 }
      : c,
  );
  writeCompaniesToLocalStorage(companies);

  const active = readActiveCompanyFromLocalStorage();
  if (active && (active.dbRowId === companyDbRowId || String(active.id) === companyDbRowId)) {
    localStorage.setItem(
      ATLAS_STORAGE_KEYS.activeCompany,
      JSON.stringify({ ...active, balance: 0 }),
    );
  }
}

/** Empty all transactional data for a company; profile row is preserved. */
export async function clearCompanyData(
  companyDbRowId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!companyDbRowId?.trim()) return { ok: false, error: 'company_id_required' };

  if (!isAtlasSupabaseDataEnabled()) {
    clearLocalCompanyData(companyDbRowId);
    return { ok: true };
  }

  const res = await fetch(`/api/companies/${encodeURIComponent(companyDbRowId)}/clear-data`, {
    method: 'POST',
    credentials: 'include',
  });

  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    return { ok: false, error: body.message ?? body.error ?? 'clear_failed' };
  }

  return { ok: true };
}
