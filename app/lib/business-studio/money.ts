/**
 * Monetary arithmetic for the Business Studio engine.
 *
 * Every amount is an integer number of centimes (1 MAD = 100). Integers stay exact up to
 * Number.MAX_SAFE_INTEGER (about 90 000 billion MAD), far above any study. Rounding happens once,
 * when a rate or ratio is applied (`applyRate`, `mulCents`), half away from zero; sums and
 * differences are then exact, so statement totals and the balance-sheet identity hold to the centime.
 */

export type Cents = number;

export function toCents(mad: number): Cents {
  if (!Number.isFinite(mad)) return 0;
  return roundHalfAwayFromZero(mad * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const floor = Math.floor(abs);
  const frac = abs - floor;
  // 1e-9 absorbs binary noise such as 2.675 * 100 = 267.49999999999997.
  const rounded = frac + 1e-9 >= 0.5 ? floor + 1 : floor;
  return sign * rounded === 0 ? 0 : sign * rounded;
}

/** cents × factor, rounded to the centime. */
export function mulCents(cents: Cents, factor: number): Cents {
  return roundHalfAwayFromZero(cents * factor);
}

/** cents × pct / 100, rounded to the centime. */
export function applyRate(cents: Cents, pct: number): Cents {
  return roundHalfAwayFromZero((cents * pct) / 100);
}

export function sum(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Splits `amount` into parts proportional to `weights`, exactly (largest-remainder method), so the
 * parts always add back to `amount`.
 */
export function allocate(amount: Cents, weights: readonly number[]): Cents[] {
  const totalWeight = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (weights.length === 0) return [];
  if (totalWeight <= 0) return weights.map((_, i) => (i === 0 ? amount : 0));
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const raw = weights.map((w) => (abs * Math.max(0, w)) / totalWeight);
  const parts = raw.map((r) => Math.floor(r));
  let remainder = abs - parts.reduce((s, p) => s + p, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0 && k < order.length; k += 1, remainder -= 1) parts[order[k].i] += 1;
  return parts.map((p) => p * sign);
}

/** Safe ratio: null when the denominator is zero or either side is not finite. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

const MAD_FORMAT = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const MAD_FORMAT_2 = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole dirhams with French grouping, for screen tables and charts. */
export function formatMad(cents: Cents): string {
  return MAD_FORMAT.format(Math.round(cents / 100)).replace(/\u202f|\u00a0/g, ' ');
}

/** Dirhams with two decimals, as in exports. */
export function formatMad2(cents: Cents): string {
  return MAD_FORMAT_2.format(cents / 100).replace(/\u202f|\u00a0/g, ' ');
}

export function formatPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return 'n.d.';
  return `${(value * 100).toFixed(digits).replace('.', ',')} %`;
}
