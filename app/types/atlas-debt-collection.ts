/** Smart debt collection types — aging, risk, follow-ups. */

import type { DebtCollectionStage } from '@/app/types/atlas-enterprise-modules';

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
export type RiskBand = 'low' | 'medium' | 'high' | 'critical';
export type FollowUpChannel = 'email' | 'whatsapp' | 'in_app' | 'manual';

export type AtlasDebtFollowUp = {
  id: string;
  caseId: string;
  channel: FollowUpChannel;
  recipient: string | null;
  stage: DebtCollectionStage;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  sentAt: string;
  createdAt: string;
};

export type AtlasClientRiskProfile = {
  id: string;
  companyId: string | null;
  clientId: string | null;
  clientName: string;
  riskScore: number;
  riskBand: RiskBand;
  totalOutstanding: number;
  overdueCount: number;
  maxDaysOverdue: number;
  lastPaymentAt: string | null;
  updatedAt: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
};

export type DebtAgingSummary = {
  bucket: AgingBucket;
  label: string;
  count: number;
  amount: number;
};

export type DebtCollectionDashboard = {
  cases: import('@/app/types/atlas-enterprise-modules').AtlasDebtCollectionCase[];
  totalDue: number;
  aging: DebtAgingSummary[];
  riskProfiles: AtlasClientRiskProfile[];
  followUps: AtlasDebtFollowUp[];
  stats: {
    activeCases: number;
    overdueInvoices: number;
    highRiskClients: number;
    remindersSentWeek: number;
  };
};

export const STAGE_LABELS: Record<DebtCollectionStage, string> = {
  reminder_1: 'Relance amiable',
  reminder_2: 'Relance ferme',
  formal_notice: 'Mise en demeure',
  legal: 'Contentieux',
  closed: 'Clôturé',
  paid: 'Payé',
};

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'À échéance',
  '1-30': '1–30 jours',
  '31-60': '31–60 jours',
  '61-90': '61–90 jours',
  '90+': '90+ jours',
};

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  low: 'Faible',
  medium: 'Modéré',
  high: 'Élevé',
  critical: 'Critique',
};
