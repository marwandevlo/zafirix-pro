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
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rowToDelivery(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    invoiceId: (row.invoice_id as string | null) ?? null,
    waybillNumber: String(row.waybill_number ?? ''),
    carrier: (row.carrier as string | null) ?? null,
    status: row.status,
    codAmount: Number(row.cod_amount ?? 0),
    codCollected: Number(row.cod_collected ?? 0),
    trackingUrl: (row.tracking_url as string | null) ?? null,
    recipientName: (row.recipient_name as string | null) ?? null,
    recipientPhone: (row.recipient_phone as string | null) ?? null,
    deliveredAt: (row.delivered_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
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
    .from('zafirix_deliveries')
    .select('*')
    .eq('company_id', access.companyId)
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return mapDbError(error, { deliveries: [] });
  return NextResponse.json({
    ok: true,
    deliveries: (data ?? []).map((r) => rowToDelivery(r as Record<string, unknown>)),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    invoiceId?: string;
    waybillNumber?: string;
    carrier?: string;
    codAmount?: number;
    recipientName?: string;
    recipientPhone?: string;
    trackingUrl?: string;
  };

  if (!body.companyId || !body.waybillNumber) {
    return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const { data, error } = await admin
    .from('zafirix_deliveries')
    .insert({
      user_id: session.userId,
      company_id: access.companyId,
      invoice_id: body.invoiceId ?? null,
      waybill_number: body.waybillNumber,
      carrier: body.carrier ?? null,
      cod_amount: body.codAmount ?? 0,
      recipient_name: body.recipientName ?? null,
      recipient_phone: body.recipientPhone ?? null,
      tracking_url: body.trackingUrl ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) return mapDbError(error);
  return NextResponse.json({ ok: true, delivery: rowToDelivery(data as Record<string, unknown>) });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    id?: string;
    status?: string;
    codCollected?: number;
  };

  if (!body.id) return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));

  const admin = getSupabaseServiceRoleClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) patch.status = body.status;
  if (body.codCollected != null) patch.cod_collected = body.codCollected;
  if (body.status === 'delivered' || body.status === 'cod_collected') {
    patch.delivered_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from('zafirix_deliveries')
    .update(patch)
    .eq('id', body.id)
    .eq('user_id', session.userId)
    .select('*')
    .single();

  if (error) return mapDbError(error);
  return NextResponse.json({ ok: true, delivery: rowToDelivery(data as Record<string, unknown>) });
}
