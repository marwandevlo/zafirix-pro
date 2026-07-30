/** Logistics & COD — types aligned with zafirix_deliveries / partners / tracking / reconciliation. */

export type DeliveryStatus =
  | 'pending'
  | 'in_transit'
  | 'delivered'
  | 'cod_collected'
  | 'cancelled'
  | 'returned';

export type AtlasDeliveryPartner = {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  phone: string | null;
  trackingUrlTemplate: string | null;
  isActive: boolean;
  createdAt: string;
};

export type AtlasShipmentTrackingEvent = {
  id: string;
  deliveryId: string;
  status: DeliveryStatus;
  note: string | null;
  location: string | null;
  recordedAt: string;
  createdAt: string;
};

export type CodCollectionMethod = 'cash' | 'transfer' | 'partner_settlement' | 'other';

export type AtlasCodReconciliation = {
  id: string;
  deliveryId: string;
  invoiceId: string | null;
  expectedAmount: number;
  collectedAmount: number;
  varianceAmount: number;
  collectionMethod: CodCollectionMethod;
  paymentId: string | null;
  notes: string | null;
  reconciledAt: string;
  createdAt: string;
};

export type AtlasDelivery = {
  id: string;
  companyId: string | null;
  invoiceId: string | null;
  partnerId: string | null;
  waybillNumber: string;
  trackingId: string | null;
  carrier: string | null;
  partnerName?: string | null;
  status: DeliveryStatus;
  codAmount: number;
  codCollected: number;
  trackingUrl: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  notes: string | null;
  deliveredAt: string | null;
  createdAt: string;
  invoiceNumber?: string | null;
  invoiceClient?: string | null;
  trackingEvents?: AtlasShipmentTrackingEvent[];
  codReconciliations?: AtlasCodReconciliation[];
};

export type LogisticsDashboardSummary = {
  activeShipments: number;
  pendingCod: number;
  codOutstanding: number;
  deliveredToday: number;
  partnerCount: number;
};

export type LogisticsDashboardPayload = {
  deliveries: AtlasDelivery[];
  partners: AtlasDeliveryPartner[];
  summary: LogisticsDashboardSummary;
};
