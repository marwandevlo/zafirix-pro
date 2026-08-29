import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysYmd } from '@/app/lib/atlas-dates';
import { ATLAS_REFERRAL_CONFIG } from '@/app/lib/atlas-referral-config';
import {
  getNextReferralMilestone,
  getReferralProgressLabel,
  getTierProgramTotalDays,
  isReferralBonusFeaturesUnlocked,
} from '@/app/lib/atlas-referral-tiers';
import { recordServerAnalyticsEvent } from '@/app/lib/server-analytics-event';

const FREE_TRIAL_PLAN_ID = 'free-trial';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReferralCodeCandidate(): string {
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]!;
  }
  return out;
}

export async function ensureReferralCodeForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ code: string; created: boolean }> {
  const { data: existing } = await admin.from('atlas_referral_codes').select('code').eq('user_id', userId).maybeSingle();
  if (existing?.code && typeof existing.code === 'string') {
    return { code: String(existing.code).toUpperCase(), created: false };
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateReferralCodeCandidate();
    const { error } = await admin.from('atlas_referral_codes').insert({ user_id: userId, code });
    if (!error) return { code, created: true };
    const c = (error as { code?: string }).code;
    if (c === '23505') continue;
    throw error;
  }
  throw new Error('referral_code_generation_failed');
}

export async function resolveReferrerUserId(admin: SupabaseClient, code: string): Promise<string | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const { data } = await admin.from('atlas_referral_codes').select('user_id').eq('code', c).maybeSingle();
  const id = data && typeof (data as { user_id?: string }).user_id === 'string' ? (data as { user_id: string }).user_id : null;
  return id;
}

export async function insertReferralClick(admin: SupabaseClient, referrerUserId: string, referralCode: string): Promise<void> {
  await admin.from('atlas_referrals').insert({
    referrer_user_id: referrerUserId,
    referred_user_id: null,
    referral_code: referralCode.trim().toUpperCase(),
    status: 'clicked',
  });
}

type Metadata = Record<string, unknown>;

function asMetadata(v: unknown): Metadata {
  if (v && typeof v === 'object' && !Array.isArray(v)) return { ...(v as Metadata) };
  return {};
}

async function extendFreeTrialEndDate(
  admin: SupabaseClient,
  userId: string,
  extraDays: number,
): Promise<boolean> {
  if (extraDays <= 0) return false;
  const { data: rows } = await admin
    .from('atlas_subscriptions')
    .select('id, end_date, metadata, plan_id, status')
    .eq('user_id', userId)
    .eq('plan_id', FREE_TRIAL_PLAN_ID)
    .in('status', ['trial', 'active'])
    .order('created_at', { ascending: false })
    .limit(1);
  const row = rows?.[0] as { id?: string; end_date?: string; metadata?: unknown } | undefined;
  if (!row?.id || !row.end_date) return false;
  const nextEnd = addDaysYmd(String(row.end_date), extraDays);
  const meta = asMetadata(row.metadata);
  meta.referral_trial_extension_days = (Number(meta.referral_trial_extension_days) || 0) + extraDays;
  await admin.from('atlas_subscriptions').update({ end_date: nextEnd, metadata: meta }).eq('id', row.id);
  return true;
}

export type CompleteSignupResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: 'invalid_code' | 'self_referral' | 'not_configured' };

export async function completeReferralSignup(
  admin: SupabaseClient,
  referredUserId: string,
  rawCode: string,
): Promise<CompleteSignupResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: 'invalid_code' };

  const referrerId = await resolveReferrerUserId(admin, code);
  if (!referrerId) return { ok: false, reason: 'invalid_code' };
  if (referrerId === referredUserId) return { ok: false, reason: 'self_referral' };

  const { data: existing } = await admin
    .from('atlas_referrals')
    .select('id, referred_welcome_bonus_applied_at')
    .eq('referred_user_id', referredUserId)
    .maybeSingle();

  if (existing?.id) {
    const row = existing as { id: string; referred_welcome_bonus_applied_at?: string | null };
    if (!row.referred_welcome_bonus_applied_at) {
      const bonusDays = ATLAS_REFERRAL_CONFIG.referredWelcomeBonusTrialDays;
      if (bonusDays > 0) {
        const applied = await extendFreeTrialEndDate(admin, referredUserId, bonusDays);
        if (applied) {
          await admin
            .from('atlas_referrals')
            .update({
              referred_welcome_bonus_applied_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          void recordServerAnalyticsEvent(admin, {
            userId: referredUserId,
            eventName: 'referral_signup_completed',
            path: '/api/referral/complete-signup',
            metadata: { referral_code: code, deferred_welcome: true },
          });
        }
      }
    }
    return { ok: true, already: true };
  }

  const { error: insErr } = await admin.from('atlas_referrals').insert({
    referrer_user_id: referrerId,
    referred_user_id: referredUserId,
    referral_code: code,
    status: 'signed_up',
  });

  if (insErr) {
    const c = (insErr as { code?: string }).code;
    if (c === '23505') {
      return { ok: true, already: true };
    }
    throw insErr;
  }

  const bonusDays = ATLAS_REFERRAL_CONFIG.referredWelcomeBonusTrialDays;
  if (bonusDays > 0) {
    const applied = await extendFreeTrialEndDate(admin, referredUserId, bonusDays);
    if (applied) {
      await admin
        .from('atlas_referrals')
        .update({
          referred_welcome_bonus_applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('referred_user_id', referredUserId)
        .eq('referral_code', code);
    }
  }

  void recordServerAnalyticsEvent(admin, {
    userId: referredUserId,
    eventName: 'referral_signup_completed',
    path: '/api/referral/complete-signup',
    metadata: { referral_code: code },
  });

  return { ok: true, already: false };
}

/** Never throws — registration / auth must continue if referral attach fails. */
export async function attachReferralSafely(
  admin: SupabaseClient,
  referredUserId: string,
  rawCode: string,
): Promise<CompleteSignupResult | { ok: false; reason: 'error' }> {
  try {
    const result = await completeReferralSignup(admin, referredUserId, rawCode);
    if (!result.ok) {
      console.info('[referral] attach skipped', { referredUserId, reason: result.reason });
    } else {
      console.info('[referral] relationship saved', { referredUserId, already: result.already });
    }
    return result;
  } catch (error) {
    console.error('[referral] attach failed (non-blocking)', {
      referredUserId,
      message: error instanceof Error ? error.message : error,
    });
    return { ok: false, reason: 'error' };
  }
}

export type ActivateReferralResult =
  | {
      ok: true;
      already: boolean;
      rewardGranted: boolean;
      activatedCount?: number;
      tierDeltaDays?: number;
      bonusFeaturesUnlocked?: boolean;
    }
  | { ok: false; reason: 'no_pending_referral' };

export type ApplyReferrerTierResult = {
  activated: number;
  deltaDays: number;
  bonusFeaturesUnlocked: boolean;
  desiredTotalDays: number;
};

/**
 * Counts activated referrals for a referrer (filleuls who completed activation).
 */
export async function countActivatedReferralsForReferrer(admin: SupabaseClient, referrerUserId: string): Promise<number> {
  const { count, error } = await admin
    .from('atlas_referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', referrerUserId)
    .eq('status', 'activated');
  if (error) return 0;
  return typeof count === 'number' ? count : 0;
}

export async function countReferralFunnelForReferrer(
  admin: SupabaseClient,
  referrerUserId: string,
): Promise<{ clicks: number; signups: number; activated: number }> {
  const { data, error } = await admin
    .from('atlas_referrals')
    .select('status')
    .eq('referrer_user_id', referrerUserId);
  if (error || !Array.isArray(data)) return { clicks: 0, signups: 0, activated: 0 };
  let clicks = 0;
  let signups = 0;
  let activated = 0;
  for (const row of data) {
    const status = String((row as { status?: string }).status ?? '');
    if (status === 'clicked') clicks += 1;
    else if (status === 'signed_up') signups += 1;
    else if (status === 'activated') activated += 1;
  }
  return { clicks, signups: signups + activated, activated };
}

/** Applies tiered trial extension + bonus-features flag on referrer free-trial row. Instant delta vs last applied. */
export async function applyReferrerTierRewardsForReferrer(
  admin: SupabaseClient,
  referrerUserId: string,
): Promise<ApplyReferrerTierResult> {
  const activated = await countActivatedReferralsForReferrer(admin, referrerUserId);
  const desired = getTierProgramTotalDays(activated);

  const { data: subRows } = await admin
    .from('atlas_subscriptions')
    .select('id, end_date, metadata')
    .eq('user_id', referrerUserId)
    .eq('plan_id', FREE_TRIAL_PLAN_ID)
    .in('status', ['trial', 'active'])
    .order('created_at', { ascending: false })
    .limit(1);

  const sub = subRows?.[0] as { id?: string; end_date?: string; metadata?: unknown } | undefined;
  if (!sub?.id || !sub.end_date) {
    return { activated, deltaDays: 0, bonusFeaturesUnlocked: false, desiredTotalDays: desired };
  }

  const meta = asMetadata(sub.metadata);
  const applied = Number(meta.referral_tier_program_days_applied) || 0;
  const delta = Math.max(0, desired - applied);
  const wantBonus = isReferralBonusFeaturesUnlocked(activated);
  const bonusFeaturesUnlocked = wantBonus && meta.referral_bonus_features !== true;
  meta.referral_tier_program_days_applied = desired;
  if (bonusFeaturesUnlocked) {
    meta.referral_bonus_features = true;
  }

  let newEnd = String(sub.end_date);
  if (delta > 0) {
    newEnd = addDaysYmd(String(sub.end_date), delta);
    meta.referral_trial_extension_days = (Number(meta.referral_trial_extension_days) || 0) + delta;
  }

  if (delta > 0 || bonusFeaturesUnlocked) {
    await admin
      .from('atlas_subscriptions')
      .update({ end_date: newEnd, metadata: meta })
      .eq('id', sub.id);
  }

  return { activated, deltaDays: delta, bonusFeaturesUnlocked, desiredTotalDays: desired };
}

export async function activateReferralForUser(admin: SupabaseClient, referredUserId: string): Promise<ActivateReferralResult> {
  const { data: row } = await admin
    .from('atlas_referrals')
    .select('id, referrer_user_id, status')
    .eq('referred_user_id', referredUserId)
    .eq('status', 'signed_up')
    .maybeSingle();

  const r = row as { id: string; referrer_user_id: string; status: string } | null;
  if (!r?.id) {
    const { data: act } = await admin
      .from('atlas_referrals')
      .select('id')
      .eq('referred_user_id', referredUserId)
      .eq('status', 'activated')
      .maybeSingle();
    if (act?.id) return { ok: true, already: true, rewardGranted: true };
    return { ok: false, reason: 'no_pending_referral' };
  }

  const cfg = ATLAS_REFERRAL_CONFIG.referrerReward;
  let rewardGranted = false;

  await admin
    .from('atlas_referrals')
    .update({
      status: 'activated',
      updated_at: new Date().toISOString(),
      referrer_reward_granted_at: new Date().toISOString(),
    })
    .eq('id', r.id);

  let activatedCount = 0;
  let tierDeltaDays = 0;
  let bonusFeaturesUnlocked = false;

  if (cfg.mode === 'trial_days') {
    const tier = await applyReferrerTierRewardsForReferrer(admin, r.referrer_user_id);
    activatedCount = tier.activated;
    tierDeltaDays = tier.deltaDays;
    bonusFeaturesUnlocked = tier.bonusFeaturesUnlocked;
    rewardGranted = tier.deltaDays > 0 || tier.bonusFeaturesUnlocked;
  } else if (cfg.mode === 'company_slots' && cfg.extraCompanySlots > 0) {
    const { data: subRows } = await admin
      .from('atlas_subscriptions')
      .select('id, metadata')
      .eq('user_id', r.referrer_user_id)
      .in('status', ['trial', 'active'])
      .order('created_at', { ascending: false })
      .limit(1);
    const sub = subRows?.[0] as { id?: string; metadata?: unknown } | undefined;
    if (sub?.id) {
      const meta = asMetadata(sub.metadata);
      meta.referral_extra_company_slots = (Number(meta.referral_extra_company_slots) || 0) + cfg.extraCompanySlots;
      await admin.from('atlas_subscriptions').update({ metadata: meta }).eq('id', sub.id);
      rewardGranted = true;
    }
    activatedCount = await countActivatedReferralsForReferrer(admin, r.referrer_user_id);
  }

  const nextM = getNextReferralMilestone(activatedCount);
  const progress = getReferralProgressLabel(activatedCount);
  void recordServerAnalyticsEvent(admin, {
    userId: r.referrer_user_id,
    eventName: 'referral_progress',
    path: '/api/referral/activate',
    metadata: {
      activated: activatedCount,
      next_milestone: nextM,
      progress_label: progress.text,
      bar_percent: progress.barPercent,
    },
  });

  if (tierDeltaDays > 0 || bonusFeaturesUnlocked) {
    void recordServerAnalyticsEvent(admin, {
      userId: r.referrer_user_id,
      eventName: 'reward_unlocked',
      path: '/api/referral/activate',
      metadata: {
        referred_user_id: referredUserId,
        delta_days: tierDeltaDays,
        tier_total_days: getTierProgramTotalDays(activatedCount),
        bonus_features: bonusFeaturesUnlocked,
      },
    });
  }

  if (rewardGranted) {
    void recordServerAnalyticsEvent(admin, {
      userId: r.referrer_user_id,
      eventName: 'referral_reward_granted',
      path: '/api/referral/activate',
      metadata: {
        referred_user_id: referredUserId,
        mode: cfg.mode,
        tier_delta_days: tierDeltaDays,
        bonus_features: bonusFeaturesUnlocked,
      },
    });
  }

  return {
    ok: true,
    already: false,
    rewardGranted,
    activatedCount,
    tierDeltaDays,
    bonusFeaturesUnlocked,
  };
}

/** If user signed up with a code but trial row was created before referral attach — apply welcome days once. */
export async function applyPendingReferralWelcomeOnTrialGrant(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: row } = await admin
    .from('atlas_referrals')
    .select('id, referral_code, referred_welcome_bonus_applied_at')
    .eq('referred_user_id', userId)
    .maybeSingle();
  const r = row as { id?: string; referred_welcome_bonus_applied_at?: string | null } | null;
  if (!r?.id || r.referred_welcome_bonus_applied_at) return;
  const days = ATLAS_REFERRAL_CONFIG.referredWelcomeBonusTrialDays;
  if (days <= 0) return;
  const applied = await extendFreeTrialEndDate(admin, userId, days);
  if (applied) {
    await admin
      .from('atlas_referrals')
      .update({ referred_welcome_bonus_applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', r.id);
  }
}
