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
import { resolvePassPermissions } from '@/app/lib/atlas-auditor-pass-server';
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { AuditorRole, AuditorScope } from '@/app/types/atlas-auditor-pass';
import { AUDITOR_ROLE_LABELS, AUDITOR_SCOPE_LABELS } from '@/app/types/atlas-auditor-pass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rowToPass(p: Record<string, unknown>, base: string) {
  const role = (p.auditor_role ?? 'external_auditor') as AuditorRole;
  const scope = p.scope as AuditorScope;
  return {
    id: String(p.id),
    label: p.label,
    scope,
    scopeLabel: AUDITOR_SCOPE_LABELS[scope] ?? scope,
    auditorRole: role,
    auditorRoleLabel: AUDITOR_ROLE_LABELS[role] ?? role,
    permissions: resolvePassPermissions(role, scope, p.permissions as string[] | null),
    auditorEmail: (p.auditor_email as string | null) ?? null,
    auditorFirm: (p.auditor_firm as string | null) ?? null,
    expiresAt: p.expires_at,
    accessCount: p.access_count,
    lastAccessAt: (p.last_access_at as string | null) ?? null,
    guestUrl: `${base}/auditor/${p.token}`,
    createdAt: p.created_at,
  };
}

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
  const passes = (data ?? []).map((p) => rowToPass(p as Record<string, unknown>, base));

  return NextResponse.json({
    ok: true,
    passes,
    roleLabels: AUDITOR_ROLE_LABELS,
    scopeLabels: AUDITOR_SCOPE_LABELS,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    label?: string;
    scope?: AuditorScope;
    auditorRole?: AuditorRole;
    auditorEmail?: string;
    auditorFirm?: string;
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
  const role = body.auditorRole ?? 'external_auditor';
  const scope = body.scope ?? 'read_only';
  const permissions = resolvePassPermissions(role, scope);

  const { data, error } = await admin
    .from('zafirix_auditor_passes')
    .insert({
      user_id: session.userId,
      company_id: access.companyId,
      token,
      label: body.label,
      scope,
      auditor_role: role,
      permissions,
      auditor_email: body.auditorEmail ?? null,
      auditor_firm: body.auditorFirm ?? null,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error) return mapDbError(error);

  const base = getPublicAppUrl();
  return NextResponse.json({
    ok: true,
    pass: rowToPass(data as Record<string, unknown>, base),
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
