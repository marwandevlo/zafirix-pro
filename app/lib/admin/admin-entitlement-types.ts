export type AdminEntitlementSnapshot = {
  profilePlan: string;
  profileStatus: string;
  adminOverride: boolean;
  workspace: {
    id: string | null;
    planCode: string | null;
    planName: string | null;
    status: string | null;
    trialEndsAt: string | null;
    expiresAt: string | null;
    adminOverride: boolean;
  };
  trialExpired: boolean;
  trialDaysRemaining: number | null;
  trialLabelFr: string;
  documents: {
    used: number;
    limit: number | null;
    remaining: number | null;
    unlimited: boolean;
  };
  ocr: {
    used: number;
    limit: number | null;
    remaining: number | null;
    unlimited: boolean;
  };
};

export type AdminUserBillingFields = {
  subscription_status: string | null;
  subscription_plan: string | null;
  trial_ends_at: string | null;
  trial_expired: boolean;
  trial_label: string;
  admin_override: boolean;
  documents_used: number;
  documents_limit: number | null;
};
