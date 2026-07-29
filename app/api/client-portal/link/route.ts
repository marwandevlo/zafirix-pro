import { NextRequest, NextResponse } from 'next/server';
import { asRecord } from '@/app/lib/atlas-json';
import { buildClientPortalPath, buildClientPortalUrl } from '@/app/lib/atlas-client-portal-links';
import { clientPortalDemoCode } from '@/app/lib/atlas-sprint0-flags';
import { getPublicAppUrl, getPortalBaseUrl } from '@/app/lib/atlas-app-url';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/client-portal/link?companyId= — shareable portal URL for accountants. */
export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_id_required' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('atlas_companies')
    .select('id, name, legal_name, trade_name, company_json')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'company_not_found' }, { status: 404 });

  const row = data as Record<string, unknown>;
  const json = asRecord(row.company_json) ?? {};
  const portalCode = String(json.clientPortalCode ?? json.client_portal_code ?? '').trim();
  const accessCode = portalCode || (process.env.NODE_ENV === 'development' ? clientPortalDemoCode() : '');

  if (!accessCode) {
    return NextResponse.json(
      {
        error: 'portal_code_missing',
        message: 'Définissez clientPortalCode dans les paramètres société avant de partager un lien.',
      },
      { status: 422 },
    );
  }

  const path = buildClientPortalPath(accessCode);
  const url = buildClientPortalUrl(accessCode);
  if (!path || !url) {
    return NextResponse.json({ error: 'invalid_portal_code' }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    companyId,
    companyName: String(row.trade_name ?? row.legal_name ?? row.name ?? 'Société'),
    accessCode,
    path,
    url,
    appOrigin: getPublicAppUrl(),
    portalOrigin: getPortalBaseUrl(),
  });
}
