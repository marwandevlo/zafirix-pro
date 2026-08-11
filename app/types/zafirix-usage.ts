/**
 * Company-scoped Zafirix pay-as-you-go usage (subscriptions + meters + add-ons).
 */

export type ZafirixPlanCode = 'INDEPENDANT' | 'PERSONNE_PHYSIQUE' | 'PME' | 'ULTIMATE';

export type ZafirixMeterCode = 'invoices' | 'shipments' | 'ai_requests' | 'documents' | 'ocr';

export type ZafirixSubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled' | 'expired';

export const ZAFIRIX_PLAN_CODES: ZafirixPlanCode[] = [
  'INDEPENDANT',
  'PERSONNE_PHYSIQUE',
  'PME',
  'ULTIMATE',
];

export const ZAFIRIX_METER_CODES: ZafirixMeterCode[] = [
  'invoices',
  'shipments',
  'ai_requests',
  'documents',
  'ocr',
];

export const ZAFIRIX_PLAN_LABELS_FR: Record<ZafirixPlanCode, string> = {
  INDEPENDANT: 'Indépendant',
  PERSONNE_PHYSIQUE: 'Personne Physique',
  PME: 'PME',
  ULTIMATE: 'Ultimate',
};

export const ZAFIRIX_METER_LABELS_FR: Record<ZafirixMeterCode, string> = {
  invoices: 'Factures',
  shipments: 'Expéditions',
  ai_requests: 'Requêtes IA',
  documents: 'Documents',
  ocr: 'OCR',
};

/** Suggested upgrade path when a meter is exhausted. */
export const ZAFIRIX_PLAN_UPGRADE: Partial<Record<ZafirixPlanCode, ZafirixPlanCode>> = {
  INDEPENDANT: 'PME',
  PERSONNE_PHYSIQUE: 'PME',
  PME: 'ULTIMATE',
};

export type ZafirixSubscription = {
  id: string;
  companyId: string;
  ownerUserId: string;
  planCode: ZafirixPlanCode;
  planLabel: string;
  status: ZafirixSubscriptionStatus;
  billingCycle: 'monthly' | 'yearly';
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
};

export type ZafirixMeterSnapshot = {
  meterCode: ZafirixMeterCode;
  label: string;
  used: number;
  includedLimit: number | null;
  addonBonus: number;
  effectiveLimit: number | null;
  remaining: number | null;
  unlimited: boolean;
  pct: number | null;
  nearLimit: boolean;
  exceeded: boolean;
};

export type ZafirixAddonPack = {
  code: string;
  nameFr: string;
  descriptionFr: string;
  meterCode: ZafirixMeterCode;
  quantity: number;
  priceMad: number;
};

export type ZafirixUsageCheck = {
  allowed: boolean;
  unlimited?: boolean;
  used?: number;
  limit?: number | null;
  includedLimit?: number | null;
  addonBonus?: number;
  remaining?: number | null;
  planCode?: ZafirixPlanCode;
  periodYm?: string;
  code?: string;
  messageFr?: string;
  suggestedAddons?: ZafirixAddonPack[];
  upgradeTo?: ZafirixPlanCode | null;
};

export type ZafirixUsageSummary = {
  companyId: string;
  periodYm: string;
  subscription: ZafirixSubscription;
  meters: ZafirixMeterSnapshot[];
  addons: ZafirixAddonPack[];
  pendingAddonPurchases: number;
};
