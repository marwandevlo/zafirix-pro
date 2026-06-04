export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled' | 'expired';

export type PlanCode = 'FREE' | 'STARTER' | 'PRO' | 'CABINET' | 'ENTERPRISE';

export type FeatureCode =
  | 'documents_per_month'
  | 'storage_limit_gb'
  | 'companies_limit'
  | 'users_limit'
  | 'ocr_limit'
  | 'ai_requests_limit'
  | 'bank_accounts_limit'
  | 'payroll_limit';

export const ATLAS_FEATURE_CODES: FeatureCode[] = [
  'documents_per_month',
  'storage_limit_gb',
  'companies_limit',
  'users_limit',
  'ocr_limit',
  'ai_requests_limit',
  'bank_accounts_limit',
  'payroll_limit',
];

export type AtlasSubscriptionPlan = {
  id: string;
  code: PlanCode;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  active: boolean;
  features: Record<FeatureCode, number | null>;
};

export type WorkspaceSubscription = {
  id: string;
  workspaceId: string;
  planId: string;
  planCode: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  trialEndsAt: string | null;
};

export type FeatureQuota = {
  featureCode: FeatureCode;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  allowed: boolean;
};

export type BillingUsageSummary = {
  workspaceId: string;
  subscription: WorkspaceSubscription | null;
  quotas: FeatureQuota[];
  trialDaysRemaining: number | null;
  trialExpired: boolean;
};

export type PlanChangeRequest = {
  planCode: PlanCode;
  workspaceId?: string;
};

export const FEATURE_LABELS_FR: Record<FeatureCode, string> = {
  documents_per_month: 'Documents / mois',
  storage_limit_gb: 'Stockage (Go)',
  companies_limit: 'Sociétés',
  users_limit: 'Utilisateurs',
  ocr_limit: 'OCR / mois',
  ai_requests_limit: 'Requêtes IA / mois',
  bank_accounts_limit: 'Comptes bancaires',
  payroll_limit: 'Paie / mois',
};

export const PLAN_CODES: PlanCode[] = ['FREE', 'STARTER', 'PRO', 'CABINET', 'ENTERPRISE'];

export const DEFAULT_TRIAL_DAYS = 14;

/** Maps usage event types to plan feature codes. */
export const USAGE_EVENT_TO_FEATURE: Record<string, FeatureCode> = {
  document_upload: 'documents_per_month',
  ocr_request: 'ocr_limit',
  ai_request: 'ai_requests_limit',
  invoice_created: 'documents_per_month',
  payroll_run: 'payroll_limit',
  bank_import: 'bank_accounts_limit',
};
