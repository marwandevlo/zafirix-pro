/**
 * Client portal bridge — token validation & document ingest metadata.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { asRecord } from '@/app/lib/atlas-json';
import { clientPortalDemoCode } from '@/app/lib/atlas-sprint0-flags';

export type ClientPortalSession = {
  companyId: string;
  ownerUserId: string;
  companyName: string;
};

async function resolveDemoCompanyFromDb(db: SupabaseClient): Promise<ClientPortalSession | null> {
  const envCompanyId = process.env.CLIENT_PORTAL_DEMO_COMPANY_ID?.trim();
  const envOwnerId = process.env.CLIENT_PORTAL_DEMO_OWNER_USER_ID?.trim();

  if (envCompanyId && envOwnerId) {
    const { data } = await db
      .from('atlas_companies')
      .select('id, name, legal_name, trade_name, user_id')
      .eq('id', envCompanyId)
      .eq('user_id', envOwnerId)
      .maybeSingle();
    if (data) {
      const row = data as Record<string, unknown>;
      return {
        companyId: String(row.id),
        ownerUserId: String(row.user_id),
        companyName: String(row.trade_name ?? row.legal_name ?? row.name ?? 'Société'),
      };
    }
  }

  const { data: fallback } = await db
    .from('atlas_companies')
    .select('id, name, legal_name, trade_name, user_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fallback) return null;
  const row = fallback as Record<string, unknown>;
  return {
    companyId: String(row.id),
    ownerUserId: String(row.user_id),
    companyName: String(row.trade_name ?? row.legal_name ?? row.name ?? 'Société'),
  };
}

/** Resolve portal access code to company (demo: env, auto-fallback, or company_json.clientPortalCode). */
export async function resolveClientPortalSession(
  db: SupabaseClient,
  accessCode: string,
): Promise<ClientPortalSession | null> {
  const code = accessCode.trim();
  if (!code) return null;

  const demoCode = clientPortalDemoCode();

  if (code === demoCode) {
    return resolveDemoCompanyFromDb(db);
  }

  const { data: companies } = await db
    .from('atlas_companies')
    .select('id, name, legal_name, trade_name, user_id, company_json')
    .limit(500);

  for (const row of companies ?? []) {
    const r = row as Record<string, unknown>;
    const json = asRecord(r.company_json) ?? {};
    const portalCode = String(json.clientPortalCode ?? json.client_portal_code ?? '').trim();
    if (portalCode && portalCode === code) {
      return {
        companyId: String(r.id),
        ownerUserId: String(r.user_id),
        companyName: String(r.trade_name ?? r.legal_name ?? r.name ?? 'Société'),
      };
    }
  }

  return null;
}

export function clientPortalDocumentMetadata(input: {
  originalFilename: string;
  uploadedBy: 'client_portal';
  clientNote?: string;
}): Record<string, unknown> {
  return {
    source: 'client_portal',
    clientPortalUpload: true,
    originalFilename: input.originalFilename,
    clientNote: input.clientNote ?? null,
    ingestedAt: new Date().toISOString(),
    vaultTags: ['client_upload', 'a_valider'],
    vaultFolder: 'fichiers_fiscaux',
  };
}
