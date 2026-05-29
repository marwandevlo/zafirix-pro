/**

 * Active company context for multi-tenant flows (Sprint A).

 * Supabase: `atlas_companies.is_active`; local dev: `atlas_company` in localStorage.

 */



import type { AtlasCompany } from '@/app/types/atlas-company';

import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

import {

  ensureValidActiveCompany,

  listAtlasCompanies,

  readActiveCompanyFromLocalStorage,

  setActiveAtlasCompany,

  upsertAtlasCompany,

} from '@/app/lib/atlas-companies-repository';

import { listAtlasClients } from '@/app/lib/atlas-clients-repository';



export async function getActiveAtlasCompany(): Promise<AtlasCompany | null> {

  if (!isAtlasSupabaseDataEnabled()) {

    const partial = readActiveCompanyFromLocalStorage();

    if (partial?.raisonSociale?.trim()) return partial as AtlasCompany;

    return null;

  }



  await ensureValidActiveCompany();

  const list = await listAtlasCompanies();

  return list.find((c) => c.actif) ?? list[0] ?? null;

}



export async function getActiveCompanyDbRowId(): Promise<string | null> {

  const company = await getActiveAtlasCompany();

  if (company?.dbRowId) return company.dbRowId;

  if (isAtlasSupabaseDataEnabled() && typeof company?.id === 'string') return company.id;

  return null;

}



/** Persist settings / profile fields onto the active company row (Supabase or local). */

export async function saveActiveCompanyFields(

  fields: Partial<AtlasCompany>,

): Promise<{ ok: true } | { ok: false; error: string }> {

  const current = await getActiveAtlasCompany();

  if (!current) return { ok: false, error: 'no_active_company' };



  const merged: AtlasCompany = { ...current, ...fields, actif: true };

  const res = await upsertAtlasCompany(merged);

  if (!res.ok) return res;



  if (isAtlasSupabaseDataEnabled()) {

    const active = await setActiveAtlasCompany(res.dbRowId);

    if (!active.ok) return active;

  }



  return { ok: true };

}



/** Match invoice client name to a persisted client id (same user, optional company scope). */

export async function resolveClientIdByName(

  clientName: string,

  companyId?: string | null,

): Promise<string | null> {

  const clients = await listAtlasClients({ companyId: companyId ?? undefined });

  const needle = clientName.trim().toLowerCase();

  const match = clients.find((c) => {

    if (c.name.trim().toLowerCase() !== needle) return false;

    if (companyId && c.companyId && c.companyId !== companyId) return false;

    return typeof c.id === 'string';

  });

  return match && typeof match.id === 'string' ? match.id : null;

}


