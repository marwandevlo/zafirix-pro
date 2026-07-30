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
import { buildTrackingUrl } from '@/app/lib/atlas-logistics';
import {
  insertTrackingEvent,
  rowToCodReconciliation,
  rowToDelivery,
  rowToTrackingEvent,
} from '@/app/lib/atlas-logistics-server';
import type { DeliveryStatus } from '@/app/types/atlas-enterprise-modules';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<DeliveryStatus>([
  'pending',
  'in_transit',
  'delivered',
  'cod_collected',
  'cancelled',
  'returned',
]);

type DeliveryRow = Record<string, unknown> & {
  zafirix_delivery_partners?: { name?: string; tracking_url_template?: string | null } | null;
  atlas_invoices?: { invoice_json?: { number?: string; clientName?: string } | null } | null;
};

function mapDeliveryRow(row: DeliveryRow, extras?: {
  trackingEvents?: ReturnType<typeof rowToTrackingEvent>[];
  codReconciliations?: ReturnType<typeof rowToCodReconciliation>[];
}) {
  return rowToDelivery(row, {
    partner: row.zafirix_delivery_partners ?? null,
    invoice: row.atlas_invoices ?? null,
    trackingEvents: extras?.trackingEvents,
    codReconciliations: extras?.codReconciliations,
  });
}

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const params = new URL(request.url).searchParams;
  const companyId = params.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  let q = admin
    .from('zafirix_deliveries')
    .select(`
      *,
      zafirix_delivery_partners ( name, tracking_url_template ),
      atlas_invoices ( invoice_json )
    `)
    .eq('company_id', access.companyId)
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const invoiceId = params.get('invoiceId');
  if (invoiceId) q = q.eq('invoice_id', invoiceId);

  const { data, error } = await q;
  if (error) return mapDbError(error, { deliveries: [] });

  const includeEvents = params.get('includeEvents') === '1';
  const deliveries = await Promise.all(
    (data ?? []).map(async (raw) => {
      const row = raw as DeliveryRow;
      if (!includeEvents) return mapDeliveryRow(row);

      const { data: events } = await admin
        .from('zafirix_shipment_tracking_events')
        .select('*')
        .eq('delivery_id', row.id)
        .order('recorded_at', { ascending: false })
        .limit(20);

      const { data: recons } = await admin
        .from('zafirix_cod_reconciliations')
        .select('*')
        .eq('delivery_id', row.id)
        .order('reconciled_at', { ascending: false })
        .limit(5);

      return mapDeliveryRow(row, {
        trackingEvents: (events ?? []).map((e) => rowToTrackingEvent(e as Record<string, unknown>)),
        codReconciliations: (recons ?? []).map((r) => rowToCodReconciliation(r as Record<string, unknown>)),
      });
    }),
  );

  return NextResponse.json({ ok: true, deliveries });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    invoiceId?: string;
    partnerId?: string;
    waybillNumber?: string;
    trackingId?: string;
    carrier?: string;
    codAmount?: number;
    recipientName?: string;
    recipientPhone?: string;
    trackingUrl?: string;
    notes?: string;
  };

  if (!body.companyId || !body.waybillNumber?.trim()) {
    return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  let partnerName: string | null = body.carrier?.trim() ?? null;
  let partnerTemplate: string | null = null;
  if (body.partnerId) {
    const { data: partner } = await admin
      .from('zafirix_delivery_partners')
      .select('name, tracking_url_template')
      .eq('id', body.partnerId)
      .eq('user_id', session.userId)
      .maybeSingle();
    if (partner) {
      partnerName = String(partner.name);
      partnerTemplate = (partner.tracking_url_template as string | null) ?? null;
    }
  }

  if (body.invoiceId) {
    const { data: inv } = await admin
      .from('atlas_invoices')
      .select('id')
      .eq('id', body.invoiceId)
      .eq('user_id', session.userId)
      .maybeSingle();
    if (!inv) return apiBadRequest('not_found', 'Facture liée introuvable.');
  }

  const trackingId = body.trackingId?.trim() ?? null;
  const trackingUrl =
    body.trackingUrl?.trim() ??
    buildTrackingUrl(partnerTemplate, trackingId) ??
    null;

  let codAmount = body.codAmount ?? 0;
  if (body.invoiceId && !codAmount) {
    const { data: inv } = await admin
      .from('atlas_invoices')
      .select('invoice_json')
      .eq('id', body.invoiceId)
      .maybeSingle();
    const json = inv?.invoice_json as { totalTTC?: number } | null;
    if (json?.totalTTC) codAmount = Number(json.totalTTC);
  }

  const { data, error } = await admin
    .from('zafirix_deliveries')
    .insert({
      user_id: session.userId,
      company_id: access.companyId,
      invoice_id: body.invoiceId ?? null,
      partner_id: body.partnerId ?? null,
      waybill_number: body.waybillNumber.trim(),
      tracking_id: trackingId,
      carrier: partnerName,
      cod_amount: codAmount,
      recipient_name: body.recipientName?.trim() ?? null,
      recipient_phone: body.recipientPhone?.trim() ?? null,
      tracking_url: trackingUrl,
      notes: body.notes?.trim() ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) return mapDbError(error);

  const deliveryId = String(data.id);
  await insertTrackingEvent(admin, {
    userId: session.userId,
    companyId: access.companyId,
    deliveryId,
    status: 'pending',
    note: 'Expédition créée',
  });

  return NextResponse.json({
    ok: true,
    delivery: rowToDelivery(data as Record<string, unknown>, {
      partner: partnerName ? { name: partnerName, tracking_url_template: partnerTemplate } : null,
    }),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    id?: string;
    status?: string;
    codCollected?: number;
    trackingId?: string;
    trackingUrl?: string;
    notes?: string;
    statusNote?: string;
    location?: string;
  };

  if (!body.id) return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));

  const admin = getSupabaseServiceRoleClient();
  const { data: existing, error: fetchErr } = await admin
    .from('zafirix_deliveries')
    .select('*')
    .eq('id', body.id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (fetchErr) return mapDbError(fetchErr);
  if (!existing) return apiBadRequest('not_found', 'Expédition introuvable.');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.trackingId != null) patch.tracking_id = body.trackingId.trim() || null;
  if (body.trackingUrl != null) patch.tracking_url = body.trackingUrl.trim() || null;
  if (body.notes != null) patch.notes = body.notes.trim() || null;

  if (body.status) {
    if (!VALID_STATUSES.has(body.status as DeliveryStatus)) {
      return apiBadRequest('invalid_status', 'Statut de livraison invalide.');
    }
    patch.status = body.status;
    if (body.status === 'delivered' || body.status === 'cod_collected') {
      patch.delivered_at = new Date().toISOString();
    }
  }

  if (body.codCollected != null) patch.cod_collected = body.codCollected;

  const { data, error } = await admin
    .from('zafirix_deliveries')
    .update(patch)
    .eq('id', body.id)
    .eq('user_id', session.userId)
    .select('*')
    .single();

  if (error) return mapDbError(error);

  if (body.status && body.status !== existing.status) {
    await insertTrackingEvent(admin, {
      userId: session.userId,
      companyId: (existing.company_id as string | null) ?? null,
      deliveryId: body.id,
      status: body.status as DeliveryStatus,
      note: body.statusNote ?? null,
      location: body.location ?? null,
    });
  }

  return NextResponse.json({
    ok: true,
    delivery: rowToDelivery(data as Record<string, unknown>),
  });
}
