import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import {
  isMissingRelationshipError,
  isMissingTableError,
  requireApiCompanyAccess,
} from '@/app/lib/atlas-api-company-guard';
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

type AdminClient = ReturnType<typeof getSupabaseServiceRoleClient>;

/** Prefer nested embeds; fall back to plain rows when FK/schema cache is incomplete. */
async function queryDeliveries(
  admin: AdminClient,
  opts: { companyId: string; userId: string; invoiceId: string | null },
): Promise<{ rows: DeliveryRow[]; warning?: string; error?: { message: string } }> {
  let embedded = admin
    .from('zafirix_deliveries')
    .select(`
      *,
      zafirix_delivery_partners ( name, tracking_url_template ),
      atlas_invoices ( invoice_json )
    `)
    .eq('company_id', opts.companyId)
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (opts.invoiceId) embedded = embedded.eq('invoice_id', opts.invoiceId);

  const embeddedResult = await embedded;
  if (!embeddedResult.error) {
    return { rows: (embeddedResult.data ?? []) as DeliveryRow[] };
  }

  const msg = embeddedResult.error.message;
  console.warn('[logistics/deliveries] embed query failed, trying plain select:', msg);

  // Relationship / missing partner table → still serve BL list without joins.
  if (isMissingRelationshipError(msg) || isMissingTableError(msg)) {
    let plain = admin
      .from('zafirix_deliveries')
      .select('*')
      .eq('company_id', opts.companyId)
      .eq('user_id', opts.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (opts.invoiceId) plain = plain.eq('invoice_id', opts.invoiceId);

    const plainResult = await plain;
    if (plainResult.error) {
      return { rows: [], error: plainResult.error };
    }

    return {
      rows: (plainResult.data ?? []) as DeliveryRow[],
    };
  }

  return { rows: [], error: embeddedResult.error };
}

async function loadDeliveryExtras(
  admin: AdminClient,
  deliveryIds: string[],
): Promise<{
  eventsByDelivery: Map<string, ReturnType<typeof rowToTrackingEvent>[]>;
  reconsByDelivery: Map<string, ReturnType<typeof rowToCodReconciliation>[]>;
}> {
  const eventsByDelivery = new Map<string, ReturnType<typeof rowToTrackingEvent>[]>();
  const reconsByDelivery = new Map<string, ReturnType<typeof rowToCodReconciliation>[]>();

  if (deliveryIds.length === 0) {
    return { eventsByDelivery, reconsByDelivery };
  }

  const [eventsRes, reconsRes] = await Promise.all([
    admin
      .from('zafirix_shipment_tracking_events')
      .select('*')
      .in('delivery_id', deliveryIds)
      .order('recorded_at', { ascending: false }),
    admin
      .from('zafirix_cod_reconciliations')
      .select('*')
      .in('delivery_id', deliveryIds)
      .order('reconciled_at', { ascending: false }),
  ]);

  if (eventsRes.error) {
    if (!isMissingTableError(eventsRes.error.message)) {
      console.warn('[logistics/deliveries] tracking events:', eventsRes.error.message);
    }
  } else {
    for (const event of eventsRes.data ?? []) {
      const deliveryId = String((event as Record<string, unknown>).delivery_id ?? '');
      if (!deliveryId) continue;
      const list = eventsByDelivery.get(deliveryId) ?? [];
      if (list.length < 20) {
        list.push(rowToTrackingEvent(event as Record<string, unknown>));
        eventsByDelivery.set(deliveryId, list);
      }
    }
  }

  if (reconsRes.error) {
    if (!isMissingTableError(reconsRes.error.message)) {
      console.warn('[logistics/deliveries] COD reconciliations:', reconsRes.error.message);
    }
  } else {
    for (const recon of reconsRes.data ?? []) {
      const deliveryId = String((recon as Record<string, unknown>).delivery_id ?? '');
      if (!deliveryId) continue;
      const list = reconsByDelivery.get(deliveryId) ?? [];
      if (list.length < 5) {
        list.push(rowToCodReconciliation(recon as Record<string, unknown>));
        reconsByDelivery.set(deliveryId, list);
      }
    }
  }

  return { eventsByDelivery, reconsByDelivery };
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

  const { rows, error } = await queryDeliveries(admin, {
    companyId: access.companyId,
    userId: session.userId,
    invoiceId: params.get('invoiceId'),
  });

  if (error) return mapDbError(error, { deliveries: [] });

  const includeEvents = params.get('includeEvents') === '1';
  if (!includeEvents || rows.length === 0) {
    return NextResponse.json({
      ok: true,
      deliveries: rows.map((row) => mapDeliveryRow(row)),
    });
  }

  const deliveryIds = rows.map((row) => String(row.id));
  const { eventsByDelivery, reconsByDelivery } = await loadDeliveryExtras(admin, deliveryIds);

  const deliveries = rows.map((row) =>
    mapDeliveryRow(row, {
      trackingEvents: eventsByDelivery.get(String(row.id)) ?? [],
      codReconciliations: reconsByDelivery.get(String(row.id)) ?? [],
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

  const {
    checkZafirixUsage,
    isZafirixQuotaError,
    quotaErrorMessageFr,
  } = await import('@/app/lib/zafirix-usage-server');
  const shipmentQuota = await checkZafirixUsage(admin, session.userId, access.companyId, 'shipments', 1);
  if (!shipmentQuota.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: 'quota_exceeded',
        message: shipmentQuota.messageFr ?? 'Quota d’expéditions atteint.',
        meter: 'shipments',
        suggestedAddons: shipmentQuota.suggestedAddons ?? [],
        upgradeTo: shipmentQuota.upgradeTo ?? null,
      },
      { status: 429 },
    );
  }

  let partnerName: string | null = body.carrier?.trim() ?? null;
  let partnerTemplate: string | null = null;
  if (body.partnerId) {
    const { data: partner, error: partnerErr } = await admin
      .from('zafirix_delivery_partners')
      .select('name, tracking_url_template')
      .eq('id', body.partnerId)
      .eq('user_id', session.userId)
      .maybeSingle();
    if (partnerErr && !isMissingTableError(partnerErr.message)) {
      console.warn('[logistics/deliveries] partner lookup:', partnerErr.message);
    }
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

  const basePayload: Record<string, unknown> = {
    user_id: session.userId,
    company_id: access.companyId,
    invoice_id: body.invoiceId ?? null,
    waybill_number: body.waybillNumber.trim(),
    carrier: partnerName,
    cod_amount: codAmount,
    recipient_name: body.recipientName?.trim() ?? null,
    recipient_phone: body.recipientPhone?.trim() ?? null,
    tracking_url: trackingUrl,
    status: 'pending',
  };

  const extendedPayload = {
    ...basePayload,
    partner_id: body.partnerId ?? null,
    tracking_id: trackingId,
    notes: body.notes?.trim() ?? null,
  };

  let data: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  {
    const result = await admin
      .from('zafirix_deliveries')
      .insert(extendedPayload)
      .select('*')
      .single();
    data = (result.data as Record<string, unknown> | null) ?? null;
    error = result.error;
  }

  // Columns from COD migration missing → retry without partner_id / tracking_id / notes.
  if (error && (error.message.includes('partner_id') || error.message.includes('tracking_id') || error.message.includes('notes'))) {
    console.warn('[logistics/deliveries] retry insert without COD columns:', error.message);
    const result = await admin
      .from('zafirix_deliveries')
      .insert(basePayload)
      .select('*')
      .single();
    data = (result.data as Record<string, unknown> | null) ?? null;
    error = result.error;
  }

  if (error) {
    if (isZafirixQuotaError(error.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'quota_exceeded',
          message: quotaErrorMessageFr(error.message, 'Quota d’expéditions atteint.'),
          meter: 'shipments',
          suggestedAddons: shipmentQuota.suggestedAddons ?? [],
          upgradeTo: shipmentQuota.upgradeTo ?? null,
        },
        { status: 429 },
      );
    }
    return mapDbError(error);
  }
  if (!data) return mapDbError({ message: 'insert_failed' });

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
    delivery: rowToDelivery(data, {
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
