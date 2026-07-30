/** Smart debt collection types — aging, risk, follow-ups. */

export type DebtCollectionStage =
  | 'reminder_1'
  | 'reminder_2'
  | 'formal_notice'
  | 'legal'
  | 'closed'
  | 'paid';

export type AtlasDebtCollectionCase = {
  id: string;
  companyId: string | null;
  invoiceId: string | null;
  clientId?: string | null;
  clientName: string;
  amountDue: number;
  outstandingAmount?: number;
  paidAmount?: number;
  invoiceNumber?: string | null;
  dueDate?: string | null;
  daysOverdue?: number;
  agingBucket?: AgingBucket;
  stage: DebtCollectionStage;
  stageLabel?: string;
  lastContactAt: string | null;
  nextActionAt: string | null;
  notes: string | null;
  createdAt: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
};

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
  cases: AtlasDebtCollectionCase[];
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
