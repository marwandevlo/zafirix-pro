import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Configurable affiliate commission ladder (20 → 40 %).
 * Performance (activated referrals) and referred-user plan both apply; the higher rate wins.
 *
 * Env:
 *   AFFILIATE_COMMISSION_TIERS=0:20,3:25,5:30,10:35,20:40
 *   AFFILIATE_COMMISSION_PERCENT=20   (flat override when TIERS is unset; otherwise a floor)
 */

export type AffiliateCommissionTier = {
  id: string;
  minActivated: number;
  percent: number;
  labelFr: string;
  labelAr: string;
  hintFr: string;
  hintAr: string;
};

const TIER_COPY: Array<Pick<AffiliateCommissionTier, 'id' | 'labelFr' | 'labelAr' | 'hintFr' | 'hintAr'>> = [
  { id: 'starter', labelFr: 'Starter', labelAr: 'مبتدئ', hintFr: '0 à 2 filleuls activés', hintAr: '0–2 إحالات مفعّلة' },
  { id: 'bronze', labelFr: 'Bronze', labelAr: 'برونزي', hintFr: '3 à 4 filleuls activés', hintAr: '3–4 إحالات مفعّلة' },
  { id: 'silver', labelFr: 'Argent', labelAr: 'فضي', hintFr: '5 à 9 filleuls activés', hintAr: '5–9 إحالات مفعّلة' },
  { id: 'gold', labelFr: 'Or', labelAr: 'ذهبي', hintFr: '10 à 19 filleuls activés', hintAr: '10–19 إحالة مفعّلة' },
  { id: 'platinum', labelFr: 'Platine', labelAr: 'بلاتيني', hintFr: '20 filleuls activés et plus', hintAr: '20 إحالة مفعّلة فأكثر' },
];

export const DEFAULT_AFFILIATE_COMMISSION_TIERS: AffiliateCommissionTier[] = [
  { ...TIER_COPY[0]!, minActivated: 0, percent: 20 },
  { ...TIER_COPY[1]!, minActivated: 3, percent: 25 },
  { ...TIER_COPY[2]!, minActivated: 5, percent: 30 },
  { ...TIER_COPY[3]!, minActivated: 10, percent: 35 },
  { ...TIER_COPY[4]!, minActivated: 20, percent: 40 },
];

/** Commission % when the referred user pays a given subscription plan. */
export const AFFILIATE_PLAN_COMMISSION_PERCENT: Record<string, number> = {
  starter: 20,
  growth: 25,
  pro: 30,
  business: 35,
  advanced: 40,
  enterprise: 40,
};

function clampPercent(n: number): number | null {
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function parseFlatEnvPercent(): number | null {
  const raw = process.env.AFFILIATE_COMMISSION_PERCENT?.trim();
  if (!raw) return null;
  return clampPercent(Number(raw));
}

function parseTiersEnv(): AffiliateCommissionTier[] | null {
  const raw = process.env.AFFILIATE_COMMISSION_TIERS?.trim();
  if (!raw) return null;
  const parsed: AffiliateCommissionTier[] = [];
  for (const part of raw.split(',')) {
    const [minRaw, pctRaw] = part.split(':').map((s) => s.trim());
    const minActivated = Number(minRaw);
    const percent = clampPercent(Number(pctRaw));
    if (!Number.isInteger(minActivated) || minActivated < 0 || percent == null) continue;
    const copy = TIER_COPY[parsed.length] ?? {
      id: `tier_${minActivated}`,
      labelFr: `${percent} %`,
      labelAr: `${percent}٪`,
      hintFr: `À partir de ${minActivated} filleul(s)`,
      hintAr: `من ${minActivated} إحالة`,
    };
    parsed.push({ ...copy, minActivated, percent });
  }
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => a.minActivated - b.minActivated);
  return parsed;
}

export function getAffiliateCommissionTiers(): AffiliateCommissionTier[] {
  const fromEnv = parseTiersEnv();
  if (fromEnv) return fromEnv;

  const flat = parseFlatEnvPercent();
  if (flat != null && !process.env.AFFILIATE_COMMISSION_TIERS?.trim()) {
    return DEFAULT_AFFILIATE_COMMISSION_TIERS.map((tier) => ({ ...tier, percent: flat }));
  }

  return DEFAULT_AFFILIATE_COMMISSION_TIERS.map((tier) => ({ ...tier }));
}

export function resolvePerformanceCommissionTier(
  activatedReferrals: number,
  tiers = getAffiliateCommissionTiers(),
): AffiliateCommissionTier {
  const n = Math.max(0, Math.floor(Number(activatedReferrals) || 0));
  let current = tiers[0] ?? DEFAULT_AFFILIATE_COMMISSION_TIERS[0]!;
  for (const tier of tiers) {
    if (n >= tier.minActivated) current = tier;
  }
  return current;
}

export function nextAffiliateCommissionTier(
  activatedReferrals: number,
  tiers = getAffiliateCommissionTiers(),
): AffiliateCommissionTier | null {
  const n = Math.max(0, Math.floor(Number(activatedReferrals) || 0));
  return tiers.find((tier) => tier.minActivated > n) ?? null;
}

export function resolvePlanCommissionPercent(planId?: string | null): number | null {
  if (!planId) return null;
  const key = String(planId).trim().toLowerCase();
  const pct = AFFILIATE_PLAN_COMMISSION_PERCENT[key];
  return typeof pct === 'number' ? pct : null;
}

export type AffiliateCommissionResolution = {
  percent: number;
  performancePercent: number;
  planPercent: number | null;
  tier: AffiliateCommissionTier;
  source: 'plan' | 'performance' | 'floor';
};

export function resolveAffiliateCommissionBreakdown(input?: {
  activatedReferrals?: number;
  planId?: string | null;
  tiers?: AffiliateCommissionTier[];
}): AffiliateCommissionResolution {
  const tiers = input?.tiers?.length ? input.tiers : getAffiliateCommissionTiers();
  const tier = resolvePerformanceCommissionTier(input?.activatedReferrals ?? 0, tiers);
  const performancePercent = tier.percent;
  const planPercent = resolvePlanCommissionPercent(input?.planId);
  const floor = parseTiersEnv() ? parseFlatEnvPercent() : null;

  let percent = performancePercent;
  let source: AffiliateCommissionResolution['source'] = 'performance';
  if (planPercent != null && planPercent > percent) {
    percent = planPercent;
    source = 'plan';
  }
  if (floor != null && floor > percent) {
    percent = floor;
    source = 'floor';
  }

  return { percent, performancePercent, planPercent, tier, source };
}

/** Used at payment time and on the affiliate dashboard. */
export function resolveAffiliateCommissionPercent(input?: {
  activatedReferrals?: number;
  planId?: string | null;
  tiers?: AffiliateCommissionTier[];
}): number {
  return resolveAffiliateCommissionBreakdown(input).percent;
}

export function mapAffiliateTierRows(
  rows: Array<{
    id?: string;
    min_activated?: number;
    percent?: number;
    label_fr?: string;
    label_ar?: string;
    hint_fr?: string;
    hint_ar?: string;
  }>,
): AffiliateCommissionTier[] {
  const tiers: AffiliateCommissionTier[] = [];
  for (const row of rows) {
    const percent = Number(row.percent);
    const minActivated = Number(row.min_activated);
    if (!Number.isFinite(percent) || !Number.isFinite(minActivated)) continue;
    tiers.push({
      id: String(row.id ?? `tier_${minActivated}`),
      minActivated,
      percent,
      labelFr: String(row.label_fr ?? `${percent} %`),
      labelAr: String(row.label_ar ?? `${percent}٪`),
      hintFr: String(row.hint_fr ?? ''),
      hintAr: String(row.hint_ar ?? ''),
    });
  }
  return tiers.sort((a, b) => a.minActivated - b.minActivated);
}

export async function loadAffiliateCommissionTiers(admin: SupabaseClient): Promise<AffiliateCommissionTier[]> {
  try {
    const { data, error } = await admin
      .from('atlas_affiliate_tier_config')
      .select('id, min_activated, percent, label_fr, label_ar, hint_fr, hint_ar')
      .order('sort_order', { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return getAffiliateCommissionTiers();
    const mapped = mapAffiliateTierRows(data as Parameters<typeof mapAffiliateTierRows>[0]);
    return mapped.length > 0 ? mapped : getAffiliateCommissionTiers();
  } catch {
    return getAffiliateCommissionTiers();
  }
}
