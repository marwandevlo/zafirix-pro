import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const { data, error } = await admin
    .from('zafirix_auditor_passes')
    .select('*')
    .eq('company_id', access.companyId)
    .eq('user_id', session.userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) return mapDbError(error, { passes: [] });

  const base = getPublicAppUrl();
  const passes = (data ?? []).map((p) => ({
    id: String(p.id),
    label: p.label,
    scope: p.scope,
    expiresAt: p.expires_at,
    accessCount: p.access_count,
    guestUrl: `${base}/auditor/${p.token}`,
    createdAt: p.created_at,
  }));

  return NextResponse.json({ ok: true, passes });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    label?: string;
    scope?: 'read_only' | 'audit_export';
    expiresInDays?: number;
  };

  if (!body.companyId || !body.label) {
    return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const token = randomBytes(24).toString('hex');
  const days = body.expiresInDays ?? 14;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const { data, error } = await admin
    .from('zafirix_auditor_passes')
    .insert({
      user_id: session.userId,
      company_id: access.companyId,
      token,
      label: body.label,
      scope: body.scope ?? 'read_only',
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error) return mapDbError(error);

  const base = getPublicAppUrl();
  return NextResponse.json({
    ok: true,
    pass: {
      id: String(data.id),
      label: data.label,
      guestUrl: `${base}/auditor/${token}`,
      expiresAt: data.expires_at,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));

  const admin = getSupabaseServiceRoleClient();
  const { error } = await admin
    .from('zafirix_auditor_passes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) return mapDbError(error);
  return NextResponse.json({ ok: true });
}
