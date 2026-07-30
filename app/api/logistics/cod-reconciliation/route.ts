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
import {
  insertTrackingEvent,
  rowToCodReconciliation,
  rowToDelivery,
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

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    deliveryId?: string;
    collectedAmount?: number;
    collectionMethod?: string;
    notes?: string;
    recordInvoicePayment?: boolean;
  };

  if (!body.companyId || !body.deliveryId || body.collectedAmount == null) {
    return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const { data: delivery, error: fetchErr } = await admin
    .from('zafirix_deliveries')
    .select('*')
    .eq('id', body.deliveryId)
    .eq('user_id', session.userId)
    .eq('company_id', access.companyId)
    .maybeSingle();

  if (fetchErr) return mapDbError(fetchErr);
  if (!delivery) return apiBadRequest('not_found', 'Expédition introuvable.');

  const expected = Number(delivery.cod_amount ?? 0);
  const collected = Number(body.collectedAmount);
  const variance = collected - expected;
  const invoiceId = (delivery.invoice_id as string | null) ?? null;
  const method = body.collectionMethod ?? 'cash';

  let paymentId: string | null = null;
  if (body.recordInvoicePayment && invoiceId && collected > 0) {
    const { data: payment, error: payErr } = await admin
      .from('atlas_payments')
      .insert({
        user_id: session.userId,
        company_id: access.companyId,
        invoice_id: invoiceId,
        paid_amount: collected,
        paid_at: new Date().toISOString().slice(0, 10),
        note: `Encaissement COD — BL ${delivery.waybill_number}`,
        metadata: { source: 'cod_reconciliation', delivery_id: body.deliveryId },
      })
      .select('id')
      .single();

    if (!payErr && payment?.id) {
      paymentId = String(payment.id);
    }
  }

  const { data: recon, error: reconErr } = await admin
    .from('zafirix_cod_reconciliations')
    .insert({
      user_id: session.userId,
      company_id: access.companyId,
      delivery_id: body.deliveryId,
      invoice_id: invoiceId,
      expected_amount: expected,
      collected_amount: collected,
      variance_amount: variance,
      collection_method: method,
      payment_id: paymentId,
      notes: body.notes?.trim() ?? null,
      reconciled_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (reconErr) return mapDbError(reconErr);

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from('zafirix_deliveries')
    .update({
      status: 'cod_collected',
      cod_collected: collected,
      delivered_at: delivery.delivered_at ?? now,
      updated_at: now,
    })
    .eq('id', body.deliveryId)
    .eq('user_id', session.userId)
    .select('*')
    .single();

  if (updErr) return mapDbError(updErr);

  await insertTrackingEvent(admin, {
    userId: session.userId,
    companyId: access.companyId,
    deliveryId: body.deliveryId,
    status: 'cod_collected',
    note: `COD encaissé: ${collected} MAD${variance !== 0 ? ` (écart ${variance})` : ''}`,
  });

  return NextResponse.json({
    ok: true,
    reconciliation: rowToCodReconciliation(recon as Record<string, unknown>),
    delivery: rowToDelivery(updated as Record<string, unknown>),
    paymentId,
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
    .from('zafirix_cod_reconciliations')
    .select('*')
    .eq('company_id', access.companyId)
    .eq('user_id', session.userId)
    .order('reconciled_at', { ascending: false })
    .limit(50);

  const deliveryId = params.get('deliveryId');
  if (deliveryId) q = q.eq('delivery_id', deliveryId);

  const { data, error } = await q;
  if (error) return mapDbError(error, { reconciliations: [] });

  return NextResponse.json({
    ok: true,
    reconciliations: (data ?? []).map((r) => rowToCodReconciliation(r as Record<string, unknown>)),
  });
}
