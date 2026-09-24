export type FreemiumPlan = 'free' | 'pro';
export type FreemiumMeter = 'invoices' | 'cod' | 'ai_scans' | 'team';

export const FREE_TIER_LIMITS = {
  invoices: 15,
  cod: 30,
  ai_scans: 5,
  team: 1,
} as const;

export const FREEMIUM_METER_LABELS_FR: Record<FreemiumMeter, string> = {
  invoices: 'Factures & devis',
  cod: 'Commandes COD / expéditions',
  ai_scans: 'Scans OCR IA',
  team: 'Membres d’équipe',
};

export type FreemiumMeterSnapshot = {
  meter: FreemiumMeter;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  percent: number | null;
  exceeded: boolean;
};

export type FreemiumSnapshot = {
  plan: FreemiumPlan;
  planCode: string;
  periodYm: string;
  teamMembers: number;
  meters: FreemiumMeterSnapshot[];
};

export type FreemiumCheck = {
  allowed: boolean;
  upgradeRequired: boolean;
  plan: FreemiumPlan;
  planCode?: string;
  meter: FreemiumMeter;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited?: boolean;
  code?: string;
  messageFr?: string;
};

export function isPaidFreemiumPlan(planCode: string | null | undefined): boolean {
  const code = String(planCode ?? 'FREE').trim().toUpperCase();
  return code !== '' && code !== 'FREE';
}

export function buildMeterSnapshot(
  meter: FreemiumMeter,
  used: number,
  unlimited: boolean,
): FreemiumMeterSnapshot {
  const limit = unlimited ? null : FREE_TIER_LIMITS[meter];
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const percent = limit && limit > 0 ? Math.min(1, Math.max(0, used / limit)) : null;
  return {
    meter,
    label: FREEMIUM_METER_LABELS_FR[meter],
    used,
    limit,
    remaining,
    unlimited,
    percent,
    exceeded: !unlimited && remaining !== null && remaining <= 0,
  };
}

export function upgradeMessageFr(meter: FreemiumMeter, used: number, limit: number): string {
  return `Limite Gratuit atteinte : ${used}/${limit} ${FREEMIUM_METER_LABELS_FR[meter].toLowerCase()} ce mois-ci. Passez à Pro pour continuer.`;
}
