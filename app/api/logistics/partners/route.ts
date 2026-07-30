import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import { rowToPartner } from '@/app/lib/atlas-logistics-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

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
    .from('zafirix_delivery_partners')
    .select('*')
    .eq('company_id', access.companyId)
    .eq('user_id', session.userId)
    .order('name', { ascending: true });

  if (error) return mapDbError(error, { partners: [] });
  return NextResponse.json({
    ok: true,
    partners: (data ?? []).map((r) => rowToPartner(r as Record<string, unknown>)),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    name?: string;
    code?: string;
    phone?: string;
    trackingUrlTemplate?: string;
  };

  if (!body.companyId || !body.name?.trim()) {
    return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const { data, error } = await admin
    .from('zafirix_delivery_partners')
    .insert({
      user_id: session.userId,
      company_id: access.companyId,
      name: body.name.trim(),
      code: body.code?.trim() ?? '',
      phone: body.phone?.trim() ?? null,
      tracking_url_template: body.trackingUrlTemplate?.trim() ?? null,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) return mapDbError(error);
  return NextResponse.json({ ok: true, partner: rowToPartner(data as Record<string, unknown>) });
}
