'use client';

import type { AtlasDelivery, AtlasDeliveryPartner } from '@/app/types/atlas-enterprise-modules';
import { deliveryStatusColor, deliveryStatusLabel } from '@/app/lib/atlas-logistics';

type Props = {
  delivery: AtlasDelivery | null | undefined;
  compact?: boolean;
};

export function ShipmentStatusBadge({ delivery, compact }: Props) {
  if (!delivery) return null;

  const label = deliveryStatusLabel(delivery.status);
  const color = deliveryStatusColor(delivery.status);
  const tracking = delivery.trackingId ?? delivery.waybillNumber;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}
        title={`BL ${delivery.waybillNumber}${delivery.trackingId ? ` · ${delivery.trackingId}` : ''}`}
      >
        {label}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
        {label}
      </span>
      <span className="text-[10px] text-gray-400 font-mono">{tracking}</span>
    </div>
  );
}
