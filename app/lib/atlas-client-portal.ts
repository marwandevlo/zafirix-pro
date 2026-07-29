/**
 * Client portal bridge — token validation & document ingest metadata.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { asRecord } from '@/app/lib/atlas-json';

export type ClientPortalSession = {
  companyId: string;
  ownerUserId: string;
  companyName: string;
};

/** Resolve portal access code to company (demo: env or company_json.clientPortalCode). */
export async function resolveClientPortalSession(
  db: SupabaseClient,
  accessCode: string,
): Promise<ClientPortalSession | null> {
  const code = accessCode.trim();
  if (!code) return null;

  const demoCode = process.env.CLIENT_PORTAL_DEMO_CODE ?? '1234';
  const demoCompanyId = process.env.CLIENT_PORTAL_DEMO_COMPANY_ID?.trim();
  const demoOwnerId = process.env.CLIENT_PORTAL_DEMO_OWNER_USER_ID?.trim();

  if (code === demoCode && demoCompanyId && demoOwnerId) {
    const { data } = await db
      .from('atlas_companies')
      .select('id, name, legal_name, trade_name, user_id')
      .eq('id', demoCompanyId)
      .eq('user_id', demoOwnerId)
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
