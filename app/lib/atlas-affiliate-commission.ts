import type { SupabaseClient } from '@supabase/supabase-js';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { ATLAS_REFERRAL_CONFIG } from '@/app/lib/atlas-referral-config';
import { loadAffiliateCommissionTiers, resolveAffiliateCommissionBreakdown } from '@/app/lib/atlas-affiliate-tiers';
import { activateReferralForUser, countActivatedReferralsForReferrer } from '@/app/lib/atlas-referral-server';
import { recordServerAnalyticsEvent } from '@/app/lib/server-analytics-event';

export type AffiliatePaymentSource = 'paddle' | 'manual';

export type CreditAffiliateResult =
  | { ok: true; credited: boolean; skipped?: string; commissionAmount?: number; transactionId?: string }
  | { ok: false; error: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parseMoneyString(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const n = Number(raw.replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Paddle Billing totals are usually minor units (e.g. 450000 = 4500.00). */
function fromMinorUnits(raw: unknown): number | null {
  const n = parseMoneyString(raw);
  if (n === null) return null;
  if (n >= 1000 && Number.isInteger(n)) return roundMoney(n / 100);
  return roundMoney(n);
}

export function resolvePaidSubscriptionAmount(params: {
  paddleData?: Record<string, unknown> | null;
  planId?: string | null;
  fallbackAmount?: number | null;
}): { amount: number; currency: string } {
  const plan = params.planId ? getAtlasPlanById(params.planId) : undefined;
  if (plan && plan.price > 0) {
    return { amount: plan.price, currency: plan.currency || ATLAS_REFERRAL_CONFIG.affiliateCurrency };
  }

  if (typeof params.fallbackAmount === 'number' && Number.isFinite(params.fallbackAmount) && params.fallbackAmount > 0) {
    return { amount: roundMoney(params.fallbackAmount), currency: ATLAS_REFERRAL_CONFIG.affiliateCurrency };
  }

  const data = params.paddleData ?? {};
  const details = asRecord(data.details);
  const totals = asRecord(details.totals);
  const currency =
    (typeof data.currency_code === 'string' && data.currency_code.trim()) ||
    (typeof totals.currency_code === 'string' && totals.currency_code.trim()) ||
    ATLAS_REFERRAL_CONFIG.affiliateCurrency;

  const fromTotals =
    fromMinorUnits(totals.grand_total) ??
    fromMinorUnits(totals.total) ??
    fromMinorUnits(totals.subtotal);

  if (fromTotals && fromTotals > 0) return { amount: fromTotals, currency };

  return { amount: 0, currency };
}

/**
 * Look up the referred user's affiliate row, credit the referrer, log a ledger row.
 * Never throws — payment / admin flows must stay unblocked.
 */
export async function creditAffiliateCommissionOnPayment(params: {
  admin: SupabaseClient;
  referredUserId: string;
  source: AffiliatePaymentSource;
  sourceRef: string;
  paymentAmount: number;
  currency?: string;
  planId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<CreditAffiliateResult> {
  const referredUserId = params.referredUserId.trim();
  const sourceRef = params.sourceRef.trim();
  if (!referredUserId || !sourceRef) {
    return { ok: true, credited: false, skipped: 'missing_ids' };
  }

  const amount = roundMoney(params.paymentAmount);
  if (!(amount > 0)) {
    console.info('[affiliate] skip commission: zero amount', { referredUserId, source: params.source, sourceRef });
    return { ok: true, credited: false, skipped: 'zero_amount' };
  }

  try {
    const { data: row, error: lookupErr } = await params.admin
      .from('atlas_referrals')
      .select('id, referrer_user_id, status')
      .eq('referred_user_id', referredUserId)
      .not('status', 'eq', 'clicked')
      .maybeSingle();

    if (lookupErr) {
      console.warn('[affiliate] referral lookup failed (non-blocking)', {
        referredUserId,
        message: lookupErr.message,
      });
      return { ok: true, credited: false, skipped: 'lookup_failed' };
    }

    const referral = row as { id?: string; referrer_user_id?: string; status?: string } | null;
    if (!referral?.id || !referral.referrer_user_id) {
      console.info('[affiliate] no referrer for paying user', { referredUserId, source: params.source });
      return { ok: true, credited: false, skipped: 'not_referred' };
    }

    const activated = await countActivatedReferralsForReferrer(params.admin, referral.referrer_user_id);
    const tiers = await loadAffiliateCommissionTiers(params.admin);
    const breakdown = resolveAffiliateCommissionBreakdown({
      activatedReferrals: activated,
      planId: params.planId,
      tiers,
    });
    const percent = breakdown.percent;
    const commission = roundMoney((amount * percent) / 100);
    if (!(commission > 0)) {
      return { ok: true, credited: false, skipped: 'zero_commission' };
    }

    const currency = (params.currency || ATLAS_REFERRAL_CONFIG.affiliateCurrency).trim() || 'MAD';
    const meta = {
      plan_id: params.planId ?? null,
      commission_tier: breakdown.tier.id,
      performance_percent: breakdown.performancePercent,
      plan_percent: breakdown.planPercent,
      rate_source: breakdown.source,
      activated_referrals: activated,
      ...(params.metadata ?? {}),
    };

    const rpc = await params.admin.rpc('atlas_credit_affiliate_commission', {
      p_referrer: referral.referrer_user_id,
      p_referred: referredUserId,
      p_referral_id: referral.id,
      p_source: params.source,
      p_source_ref: sourceRef,
      p_amount: amount,
      p_percent: percent,
      p_commission: commission,
      p_currency: currency,
      p_metadata: meta,
    });

    if (rpc.error) {
      console.warn('[affiliate] rpc unavailable, using fallback insert', { message: rpc.error.message });
      const credited = await creditAffiliateFallback(params.admin, {
        referrerUserId: referral.referrer_user_id,
        referredUserId,
        referralId: referral.id,
        source: params.source,
        sourceRef,
        amount,
        percent,
        commission,
        currency,
        metadata: meta,
      });
      if (!credited.ok) return credited;
      if (credited.credited) {
        await afterCommissionGranted(params.admin, {
          referrerUserId: referral.referrer_user_id,
          referredUserId,
          commission,
          source: params.source,
          sourceRef,
        });
      }
      return credited;
    }

    const payload = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    const credited = Boolean((payload as { credited?: boolean } | null)?.credited);
    const transactionId = String((payload as { transaction_id?: string } | null)?.transaction_id ?? '');

    if (credited) {
      await afterCommissionGranted(params.admin, {
        referrerUserId: referral.referrer_user_id,
        referredUserId,
        commission,
        source: params.source,
        sourceRef,
      });
    } else {
      console.info('[affiliate] already credited', { source: params.source, sourceRef, referredUserId });
    }

    return {
      ok: true,
      credited,
      skipped: credited ? undefined : 'already_credited',
      commissionAmount: credited ? commission : undefined,
      transactionId: transactionId || undefined,
    };
  } catch (error) {
    console.error('[affiliate] credit unexpected error (non-blocking)', {
      referredUserId,
      source: params.source,
      sourceRef,
      message: error instanceof Error ? error.message : error,
    });
    return { ok: false, error: error instanceof Error ? error.message : 'affiliate_credit_failed' };
  }
}

async function creditAffiliateFallback(
  admin: SupabaseClient,
  params: {
    referrerUserId: string;
    referredUserId: string;
    referralId: string;
    source: AffiliatePaymentSource;
    sourceRef: string;
    amount: number;
    percent: number;
    commission: number;
    currency: string;
    metadata: Record<string, unknown>;
  },
): Promise<CreditAffiliateResult> {
  const { error: insErr, data } = await admin
    .from('atlas_affiliate_transactions')
    .insert({
      referrer_user_id: params.referrerUserId,
      referred_user_id: params.referredUserId,
      referral_id: params.referralId,
      source: params.source,
      source_ref: params.sourceRef,
      payment_amount: params.amount,
      commission_percent: params.percent,
      commission_amount: params.commission,
      currency: params.currency,
      status: 'credited',
      metadata: params.metadata,
    })
    .select('id')
    .maybeSingle();

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === '23505') {
      return { ok: true, credited: false, skipped: 'already_credited' };
    }
    console.warn('[affiliate] transaction insert failed (non-blocking)', { message: insErr.message, code });
    return { ok: true, credited: false, skipped: 'insert_failed' };
  }

  const { data: bal } = await admin
    .from('atlas_affiliate_balances')
    .select('lifetime_earned, available_balance, pending_balance, paid_out')
    .eq('user_id', params.referrerUserId)
    .maybeSingle();

  const row = bal as {
    lifetime_earned?: number;
    available_balance?: number;
    pending_balance?: number;
    paid_out?: number;
  } | null;
  const lifetime = Number(row?.lifetime_earned || 0) + params.commission;
  const available = Number(row?.available_balance || 0) + params.commission;
  const pending = Number(row?.pending_balance ?? row?.available_balance || 0) + params.commission;
  const paidOut = Number(row?.paid_out || 0);

  if (bal) {
    const patch = {
      lifetime_earned: lifetime,
      available_balance: available,
      pending_balance: pending,
      paid_out: paidOut,
      currency: params.currency,
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await admin
      .from('atlas_affiliate_balances')
      .update(patch)
      .eq('user_id', params.referrerUserId);
    if (upErr) {
      const { error: retryErr } = await admin
        .from('atlas_affiliate_balances')
        .update({
          lifetime_earned: lifetime,
          available_balance: available,
          currency: params.currency,
          updated_at: patch.updated_at,
        })
        .eq('user_id', params.referrerUserId);
      if (retryErr) console.warn('[affiliate] balance update failed', retryErr.message);
    }
  } else {
    const { error: balErr } = await admin.from('atlas_affiliate_balances').insert({
      user_id: params.referrerUserId,
      lifetime_earned: params.commission,
      available_balance: params.commission,
      pending_balance: params.commission,
      paid_out: 0,
      currency: params.currency,
    });
    if (balErr) {
      const { error: retryErr } = await admin.from('atlas_affiliate_balances').insert({
        user_id: params.referrerUserId,
        lifetime_earned: params.commission,
        available_balance: params.commission,
        currency: params.currency,
      });
      if (retryErr && (retryErr as { code?: string }).code !== '23505') {
        console.warn('[affiliate] balance insert failed', retryErr.message);
      }
    }
  }

  await admin
    .from('atlas_referrals')
    .update({
      commission_granted_at: new Date().toISOString(),
      commission_amount: params.commission,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.referralId);

  return {
    ok: true,
    credited: true,
    commissionAmount: params.commission,
    transactionId: String((data as { id?: string } | null)?.id ?? ''),
  };
}

async function afterCommissionGranted(
  admin: SupabaseClient,
  params: {
    referrerUserId: string;
    referredUserId: string;
    commission: number;
    source: AffiliatePaymentSource;
    sourceRef: string;
  },
): Promise<void> {
  console.info('[affiliate] commission credited', {
    referrerUserId: params.referrerUserId,
    referredUserId: params.referredUserId,
    commission: params.commission,
    source: params.source,
    sourceRef: params.sourceRef,
  });

  void recordServerAnalyticsEvent(admin, {
    userId: params.referrerUserId,
    eventName: 'affiliate_commission_credited',
    path: '/api/webhooks/paddle',
    metadata: {
      referred_user_id: params.referredUserId,
      commission: params.commission,
      source: params.source,
      source_ref: params.sourceRef,
    },
  });

  try {
    await activateReferralForUser(admin, params.referredUserId);
  } catch (error) {
    console.warn('[affiliate] activate after payment failed (non-blocking)', {
      referredUserId: params.referredUserId,
      message: error instanceof Error ? error.message : error,
    });
  }
}

export async function readAffiliateBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<{
  lifetimeEarned: number;
  availableBalance: number;
  pendingBalance: number;
  paidOut: number;
  currency: string;
}> {
  const empty = {
    lifetimeEarned: 0,
    availableBalance: 0,
    pendingBalance: 0,
    paidOut: 0,
    currency: ATLAS_REFERRAL_CONFIG.affiliateCurrency,
  };
  try {
    const { data } = await admin
      .from('atlas_affiliate_balances')
      .select('lifetime_earned, available_balance, pending_balance, paid_out, currency')
      .eq('user_id', userId)
      .maybeSingle();
    const lifetimeEarned = Number((data as { lifetime_earned?: number } | null)?.lifetime_earned || 0);
    const availableBalance = Number((data as { available_balance?: number } | null)?.available_balance || 0);
    const pendingRaw = (data as { pending_balance?: number } | null)?.pending_balance;
    const paidRaw = (data as { paid_out?: number } | null)?.paid_out;
    return {
      lifetimeEarned,
      availableBalance,
      pendingBalance: pendingRaw == null ? availableBalance : Number(pendingRaw) || 0,
      paidOut: paidRaw == null ? Math.max(0, lifetimeEarned - availableBalance) : Number(paidRaw) || 0,
      currency: String((data as { currency?: string } | null)?.currency || ATLAS_REFERRAL_CONFIG.affiliateCurrency),
    };
  } catch (error) {
    console.warn('[affiliate] balance read failed', error instanceof Error ? error.message : error);
    return empty;
  }
}
