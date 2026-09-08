/**
 * Checkout promo codes map to active affiliate referral codes.
 * Override discount with ATLAS_PROMO_CHECKOUT_DISCOUNT_PERCENT (0 = attribution only).
 */
export function resolvePromoCheckoutDiscountPercent(): number {
  const raw = process.env.ATLAS_PROMO_CHECKOUT_DISCOUNT_PERCENT;
  if (raw === undefined || raw === '') return 0;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

export function applyPromoDiscount(baseAmountMad: number, discountPercent: number): {
  discountAmount: number;
  finalAmount: number;
} {
  const base = Math.max(0, Math.round(baseAmountMad * 100) / 100);
  const pct = Math.max(0, Math.min(100, discountPercent));
  if (pct <= 0 || base <= 0) {
    return { discountAmount: 0, finalAmount: base };
  }
  const discountAmount = Math.round((base * pct) / 100 * 100) / 100;
  const finalAmount = Math.max(0, Math.round((base - discountAmount) * 100) / 100);
  return { discountAmount, finalAmount };
}
