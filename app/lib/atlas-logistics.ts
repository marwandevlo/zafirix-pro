/** Logistics & COD — labels, status helpers, URL builders. */

import type { DeliveryStatus } from '@/app/types/atlas-logistics';

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'En attente',
  in_transit: 'En transit',
  delivered: 'Livré',
  cod_collected: 'COD encaissé',
  cancelled: 'Annulé',
  returned: 'Retourné',
};

export const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_transit: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  cod_collected: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-amber-100 text-amber-800',
};

export function buildTrackingUrl(
  template: string | null | undefined,
  trackingId: string | null | undefined,
): string | null {
  if (!template || !trackingId?.trim()) return null;
  if (template.includes('{tracking_id}')) {
    return template.replace('{tracking_id}', encodeURIComponent(trackingId.trim()));
  }
  return `${template.replace(/\/$/, '')}/${encodeURIComponent(trackingId.trim())}`;
}

export function deliveryStatusLabel(status: string): string {
  return DELIVERY_STATUS_LABELS[status as DeliveryStatus] ?? status;
}

export function deliveryStatusColor(status: string): string {
  return DELIVERY_STATUS_COLORS[status as DeliveryStatus] ?? 'bg-gray-100 text-gray-700';
}
