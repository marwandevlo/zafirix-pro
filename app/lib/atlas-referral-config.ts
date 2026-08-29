/**
 * Single source of truth for ZAFIRIX PRO referral rewards and copy.
 * Referrer **tier** totals (activated filleuls) live in `app/lib/atlas-referral-tiers.ts`.
 */
export const ATLAS_REFERRAL_CONFIG = {
  /** Bonus calendar days added to the referred user's free trial (after signup + attach). */
  referredWelcomeBonusTrialDays: 7,
  /** Reward for the referrer when the referred user reaches "activated". */
  referrerReward: {
    /** `trial_days` = tiered extension on referrer free-trial (see tiers). `company_slots` = flat add-on per activation. */
    mode: 'trial_days' as 'trial_days' | 'company_slots',
    /** Used only when mode is company_slots (each activation). */
    extraCompanySlots: 3,
  },
  /** SessionStorage + httpOnly cookie key for pending ?ref= until signup/login completes. */
  pendingCodeStorageKey: 'atlas_ref_code',
  cookieMaxAgeSec: 60 * 60 * 24 * 30,
  /**
   * Base / first-tier commission % (see `atlas-affiliate-tiers.ts` for 20–40% ladder).
   * Override ladder with AFFILIATE_COMMISSION_TIERS or flat AFFILIATE_COMMISSION_PERCENT.
   */
  affiliateCommissionPercent: 20,
  affiliateCurrency: 'MAD',
  /** After onboarding completion, open referral celebrate modal once (`pending` / `done`). */
  postOnboardingReferralKey: 'zafirix_referral_celebrate',
} as const;

export {
  resolveAffiliateCommissionPercent,
  getAffiliateCommissionTiers,
  resolveAffiliateCommissionBreakdown,
} from '@/app/lib/atlas-affiliate-tiers';
