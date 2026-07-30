import type {
  AtlasCodReconciliation,
  AtlasDelivery,
  AtlasDeliveryPartner,
  AtlasShipmentTrackingEvent,
  CodCollectionMethod,
  DeliveryStatus,
} from '@/app/types/atlas-logistics';
import { buildTrackingUrl } from '@/app/lib/atlas-logistics';

export function rowToPartner(row: Record<string, unknown>): AtlasDeliveryPartner {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    name: String(row.name ?? ''),
    code: String(row.code ?? ''),
    phone: (row.phone as string | null) ?? null,
    trackingUrlTemplate: (row.tracking_url_template as string | null) ?? null,
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToTrackingEvent(row: Record<string, unknown>): AtlasShipmentTrackingEvent {
  return {
    id: String(row.id),
    deliveryId: String(row.delivery_id),
    status: row.status as DeliveryStatus,
    note: (row.note as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    recordedAt: String(row.recorded_at ?? row.created_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToCodReconciliation(row: Record<string, unknown>): AtlasCodReconciliation {
  return {
    id: String(row.id),
    deliveryId: String(row.delivery_id),
    invoiceId: (row.invoice_id as string | null) ?? null,
    expectedAmount: Number(row.expected_amount ?? 0),
    collectedAmount: Number(row.collected_amount ?? 0),
    varianceAmount: Number(row.variance_amount ?? 0),
    collectionMethod: (row.collection_method as CodCollectionMethod) ?? 'cash',
    paymentId: (row.payment_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    reconciledAt: String(row.reconciled_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

type PartnerJoin = { name?: string; tracking_url_template?: string | null } | null;
type InvoiceJoin = { invoice_json?: { number?: string; clientName?: string } | null } | null;

export function rowToDelivery(
  row: Record<string, unknown>,
  opts?: {
    partner?: PartnerJoin;
    invoice?: InvoiceJoin;
    trackingEvents?: AtlasShipmentTrackingEvent[];
    codReconciliations?: AtlasCodReconciliation[];
  },
): AtlasDelivery {
  const partner = opts?.partner;
  const trackingId = (row.tracking_id as string | null) ?? null;
  const partnerTemplate = partner?.tracking_url_template ?? null;
  const explicitUrl = (row.tracking_url as string | null) ?? null;
  const invoiceJson = opts?.invoice?.invoice_json;

  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    invoiceId: (row.invoice_id as string | null) ?? null,
    partnerId: (row.partner_id as string | null) ?? null,
    waybillNumber: String(row.waybill_number ?? ''),
    trackingId,
    carrier: (row.carrier as string | null) ?? partner?.name ?? null,
    partnerName: partner?.name ?? null,
    status: row.status as DeliveryStatus,
    codAmount: Number(row.cod_amount ?? 0),
    codCollected: Number(row.cod_collected ?? 0),
    trackingUrl: explicitUrl ?? buildTrackingUrl(partnerTemplate, trackingId),
    recipientName: (row.recipient_name as string | null) ?? null,
    recipientPhone: (row.recipient_phone as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    deliveredAt: (row.delivered_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    invoiceNumber: invoiceJson?.number ?? null,
    invoiceClient: invoiceJson?.clientName ?? null,
    trackingEvents: opts?.trackingEvents,
    codReconciliations: opts?.codReconciliations,
  };
}

import type { SupabaseClient } from '@supabase/supabase-js';

export async function insertTrackingEvent(
  admin: SupabaseClient,
  params: {
    userId: string;
    companyId: string | null;
    deliveryId: string;
    status: DeliveryStatus;
    note?: string | null;
    location?: string | null;
  },
): Promise<void> {
  await admin.from('zafirix_shipment_tracking_events').insert({
    user_id: params.userId,
    company_id: params.companyId,
    delivery_id: params.deliveryId,
    status: params.status,
    note: params.note ?? null,
    location: params.location ?? null,
    recorded_at: new Date().toISOString(),
  });
}
