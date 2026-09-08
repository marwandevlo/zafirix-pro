import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';
import { resolveReferrerUserId } from '@/app/lib/atlas-referral-server';
import { applyPromoDiscount, resolvePromoCheckoutDiscountPercent } from '@/app/lib/atlas-promo-config';

export type ValidatePromoResult =
  | {
      ok: true;
      code: string;
      referrerUserId: string;
      discountPercent: number;
      discountAmount: number;
      finalAmount: number;
      attributionOnly: boolean;
    }
  | {
      ok: false;
      reason: 'invalid_code' | 'inactive_affiliate' | 'self_referral' | 'invalid_amount';
    };

export async function validateAffiliatePromoCode(
  admin: SupabaseClient,
  rawCode: string,
  options?: { referredUserId?: string | null; baseAmountMad?: number | null },
): Promise<ValidatePromoResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: 'invalid_code' };

  const referrerUserId = await resolveReferrerUserId(admin, code);
  if (!referrerUserId) return { ok: false, reason: 'invalid_code' };

  if (options?.referredUserId && options.referredUserId === referrerUserId) {
    return { ok: false, reason: 'self_referral' };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', referrerUserId)
    .maybeSingle();

  const role = String((profile as { role?: string } | null)?.role ?? '').toLowerCase();
  const status = String((profile as { status?: string } | null)?.status ?? '').toLowerCase();
  if (role !== 'affiliate' || status !== 'active') {
    return { ok: false, reason: 'inactive_affiliate' };
  }

  const discountPercent = resolvePromoCheckoutDiscountPercent();
  const baseAmount =
    typeof options?.baseAmountMad === 'number' && Number.isFinite(options.baseAmountMad)
      ? Math.max(0, options.baseAmountMad)
      : 0;

  if (options?.baseAmountMad != null && baseAmount <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const { discountAmount, finalAmount } = applyPromoDiscount(baseAmount, discountPercent);

  return {
    ok: true,
    code,
    referrerUserId,
    discountPercent,
    discountAmount,
    finalAmount: baseAmount > 0 ? finalAmount : baseAmount,
    attributionOnly: discountPercent <= 0,
  };
}
