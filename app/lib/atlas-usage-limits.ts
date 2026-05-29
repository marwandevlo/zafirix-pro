import { todayYmd } from '@/app/lib/atlas-dates';
import { readCompaniesFromLocalStorage } from '@/app/lib/atlas-companies-repository';
import { getProCompanyAddonExtraSlots } from '@/app/lib/atlas-company-addons';
import { getReferralExtraCompanySlots } from '@/app/lib/atlas-referral-bonus-state';
import { getAtlasPlanById, type AtlasLimit, type AtlasPricingPlan, type AtlasPricingPlan as Plan } from '@/app/lib/atlas-pricing-plans';
import { isOwnerSessionFlagSet } from '@/app/lib/owner';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import {
  resolveEffectiveEntitlement,
  type AtlasEntitlementRow,
} from '@/app/lib/atlas-subscription-sync';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';

export type AtlasUsage = {
  companies: number;
  users: number;
  operations: number;
  invoices: number;
};

export type AtlasUsageType = keyof AtlasUsage;

export type AtlasActiveSubscriptionLike = {
  planId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
};

export const ATLAS_USAGE_STORAGE_KEY = 'atlas_usage';
export const ATLAS_ACTIVE_SUBSCRIPTIONS_STORAGE_KEY = 'atlas_subscriptions_cache_v1';

export const DEFAULT_USAGE: AtlasUsage = {
  companies: 0,
  users: 0,
  operations: 0,
  invoices: 0,
};

export type LimitLevel = 'ok' | 'warning' | 'limit';

export type LimitDecision = {
  /** Soft limits keep navigation; hard limits set `allowed: false` for gated actions (create company / invoice). */
  allowed: boolean;
  level: LimitLevel;
  messageAr?: string;
  messageFr?: string;
  used: number;
  limit: number | null;
  percent: number | null;
};

function normalizeNumber(n: unknown): number {
  const v = typeof n === 'number' ? n : Number.parseFloat(String(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/** In-memory snapshot when Supabase is the data backend (never localStorage). */
let usageSnapshot: AtlasUsage = { ...DEFAULT_USAGE };
let activePlanSnapshot: AtlasPricingPlan | null = null;
let activeSubscriptionsSnapshot: AtlasActiveSubscriptionLike[] = [];
let usageRefreshPromise: Promise<void> | null = null;

function readJson<T>(key: string): T | null {
  if (blockCriticalLocalStorageInProduction(key)) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (blockCriticalLocalStorageInProduction(key)) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

/** Refresh plan + usage counts from Supabase (authoritative in supabase/production mode). */
export async function refreshAtlasUsageState(): Promise<void> {
  if (!isAtlasSupabaseDataEnabled()) return;

  if (usageRefreshPromise) {
    await usageRefreshPromise;
    return;
  }

  usageRefreshPromise = (async () => {
    const auth = await requireSupabaseUser();
    if (!auth.ok) {
      usageSnapshot = { ...DEFAULT_USAGE };
      activePlanSnapshot = null;
      activeSubscriptionsSnapshot = [];
      return;
    }

    const [subsRes, companiesRes, invoicesRes, paymentsRes] = await Promise.all([
      supabase
        .from('atlas_subscriptions')
        .select('plan_id, status, start_date, end_date, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('atlas_companies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', auth.userId),
      supabase
        .from('atlas_invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', auth.userId),
      supabase
        .from('atlas_payments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', auth.userId),
    ]);

    activeSubscriptionsSnapshot = (subsRes.data ?? []).map((row) => ({
      planId: String(row.plan_id ?? ''),
      status: String(row.status ?? ''),
      startDate: String(row.start_date ?? ''),
      endDate: String(row.end_date ?? ''),
      createdAt: String(row.created_at ?? ''),
    }));

    const ent = resolveEffectiveEntitlement(activeSubscriptionsSnapshot as AtlasEntitlementRow[]);
    activePlanSnapshot = ent.planId ? getAtlasPlanById(ent.planId) ?? null : null;

    const invoiceCount = invoicesRes.count ?? 0;
    const paymentCount = paymentsRes.error ? 0 : (paymentsRes.count ?? 0);

    usageSnapshot = {
      companies: companiesRes.count ?? 0,
      users: 1,
      operations: invoiceCount + paymentCount,
      invoices: invoiceCount,
    };
  })();

  try {
    await usageRefreshPromise;
  } finally {
    usageRefreshPromise = null;
  }
}

export function getUsage(): AtlasUsage {
  if (isAtlasSupabaseDataEnabled()) {
    return { ...usageSnapshot };
  }
  const raw = readJson<Partial<AtlasUsage>>(ATLAS_USAGE_STORAGE_KEY);
  if (!raw) {
    writeJson(ATLAS_USAGE_STORAGE_KEY, DEFAULT_USAGE);
    return { ...DEFAULT_USAGE };
  }
  const next: AtlasUsage = {
    companies: normalizeNumber(raw.companies),
    users: normalizeNumber(raw.users),
    operations: normalizeNumber(raw.operations),
    invoices: normalizeNumber(raw.invoices),
  };
  writeJson(ATLAS_USAGE_STORAGE_KEY, next);
  return next;
}

export function setUsage(next: AtlasUsage): void {
  if (isAtlasSupabaseDataEnabled()) {
    usageSnapshot = {
      companies: normalizeNumber(next.companies),
      users: normalizeNumber(next.users),
      operations: normalizeNumber(next.operations),
      invoices: normalizeNumber(next.invoices),
    };
    return;
  }
  writeJson(ATLAS_USAGE_STORAGE_KEY, {
    companies: normalizeNumber(next.companies),
    users: normalizeNumber(next.users),
    operations: normalizeNumber(next.operations),
    invoices: normalizeNumber(next.invoices),
  } satisfies AtlasUsage);
}

export function incrementUsage(type: AtlasUsageType, delta: number = 1): AtlasUsage {
  if (isAtlasSupabaseDataEnabled()) {
    usageSnapshot = {
      ...usageSnapshot,
      [type]: normalizeNumber((usageSnapshot[type] ?? 0) + delta),
    } as AtlasUsage;
    void refreshAtlasUsageState();
    return { ...usageSnapshot };
  }
  const current = getUsage();
  const next: AtlasUsage = { ...current, [type]: normalizeNumber((current[type] ?? 0) + delta) } as AtlasUsage;
  setUsage(next);
  return next;
}

function readActiveSubscriptions(): AtlasActiveSubscriptionLike[] {
  if (isAtlasSupabaseDataEnabled()) {
    return [...activeSubscriptionsSnapshot];
  }
  const raw = readJson<unknown>(ATLAS_ACTIVE_SUBSCRIPTIONS_STORAGE_KEY);
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as AtlasActiveSubscriptionLike[]) : [];
}

export function getActivePlan(): AtlasPricingPlan | null {
  if (isOwnerSessionFlagSet()) {
    // Owner bypass: always treat as enterprise (unlimited caps) client-side.
    return getAtlasPlanById('enterprise') ?? null;
  }
  if (isAtlasSupabaseDataEnabled()) {
    return activePlanSnapshot;
  }
  const subs = readActiveSubscriptions();
  const candidate =
    subs.find((s) => (s?.status === 'active' || s?.status === 'trial') && typeof s?.planId === 'string') ??
    subs.find((s) => typeof s?.planId === 'string') ??
    null;
  const planId = candidate?.planId;
  if (!planId) return null;
  return getAtlasPlanById(planId) ?? null;
}

function limitToNumber(limit: AtlasLimit): number | null {
  if (limit.kind === 'fixed') return normalizeNumber(limit.value);
  return null;
}

function invoicesLimitForPlan(plan: Plan | null): number | null {
  if (!plan?.invoicesLimit) return null;
  return limitToNumber(plan.invoicesLimit);
}

export function getPlanLimits(plan: Plan | null = getActivePlan()): {
  companies: number | null;
  users: number | null;
  operations: number | null;
  invoices: number | null;
} {
  if (!plan) return { companies: null, users: null, operations: null, invoices: null };
  return {
    companies: limitToNumber(plan.companiesLimit),
    users: limitToNumber(plan.usersLimit),
    operations: limitToNumber(plan.operationsLimit),
    invoices: invoicesLimitForPlan(plan),
  };
}

/** Plan limits with Pro company add-ons (+3 / +5 packs) applied to the sociétés cap only. */
export function getEffectivePlanLimits(plan: Plan | null = getActivePlan()): {
  companies: number | null;
  users: number | null;
  operations: number | null;
  invoices: number | null;
} {
  const base = getPlanLimits(plan);
  const referralExtra = getReferralExtraCompanySlots();
  if (!plan || base.companies === null) return base;
  if (plan.id === 'pro') {
    return {
      ...base,
      companies: base.companies + getProCompanyAddonExtraSlots() + referralExtra,
    };
  }
  if (plan.id === 'free-trial') {
    return {
      ...base,
      companies: base.companies + referralExtra,
    };
  }
  return base;
}

export function getUsagePercentage(type: AtlasUsageType): number | null {
  const plan = getActivePlan();
  const limits = type === 'companies' ? getEffectivePlanLimits(plan) : getPlanLimits(plan);
  const limit = limits[type];
  if (!limit || limit <= 0) return null;
  const usage = getUsage();
  return Math.min(1, usage[type] / limit);
}

/** Secondary actions (reminders, exports): always allowed, messaging only. */
function decideSoft(used: number, limit: number | null): LimitDecision {
  if (limit === null) {
    return { allowed: true, level: 'ok', used, limit: null, percent: null };
  }
  const safeLimit = Math.max(0, limit);
  const percent = safeLimit === 0 ? 1 : used / safeLimit;
  const clamped = Math.min(1, Math.max(0, percent));
  if (clamped >= 1) {
    return {
      allowed: true,
      level: 'limit',
      messageAr: 'وصلت الحد الأقصى للعمليات، قم بترقية الباقة',
      messageFr: 'Limite d’opérations atteinte — passez à une offre supérieure.',
      used,
      limit: safeLimit,
      percent: 1,
    };
  }
  if (clamped >= 0.8) {
    return {
      allowed: true,
      level: 'warning',
      messageAr: 'لقد استعملت أكثر من 80٪ من حد العمليات',
      messageFr: 'Vous approchez de la limite d’opérations de votre forfait.',
      used,
      limit: safeLimit,
      percent: clamped,
    };
  }
  return { allowed: true, level: 'ok', used, limit: safeLimit, percent: clamped };
}

/** Create company / invite / invoice: block at hard limit. */
function decideHard(used: number, limit: number | null, kind: 'company' | 'invoice' | 'user'): LimitDecision {
  if (limit === null) {
    return { allowed: true, level: 'ok', used, limit: null, percent: null };
  }
  const safeLimit = Math.max(0, limit);
  const percent = safeLimit === 0 ? 1 : used / safeLimit;
  const clamped = Math.min(1, Math.max(0, percent));
  if (clamped >= 1) {
    const msg =
      kind === 'company'
        ? {
            messageFr: 'Limite d’essai : une seule société. Passez à une offre payante pour en ajouter d’autres.',
            messageAr: 'حد التجربة: شركة واحدة فقط. ترقية الباقة لإضافة المزيد.',
          }
        : kind === 'invoice'
          ? {
              messageFr: 'Limite d’essai : 5 factures maximum. Mettez à niveau pour continuer.',
              messageAr: 'حد التجربة: 5 فواتير كحد أقصى. قم بالترقية للمتابعة.',
            }
          : {
              messageFr: 'Limite utilisateurs atteinte pour votre forfait.',
              messageAr: 'تم بلوغ حد المستخدمين لهذه الباقة.',
            };
    return {
      allowed: false,
      level: 'limit',
      ...msg,
      used,
      limit: safeLimit,
      percent: 1,
    };
  }
  if (clamped >= 0.8) {
    const warn =
      kind === 'invoice'
        ? {
            messageFr: 'Vous approchez de la limite de factures de l’essai gratuit.',
            messageAr: 'أنت قريب من الحد الأقصى لفواتير التجربة.',
          }
        : kind === 'company'
          ? {
              messageFr: 'L’essai gratuit autorise une seule société.',
              messageAr: 'التجربة المجانية تسمح بشركة واحدة.',
            }
          : {
              messageFr: 'Vous approchez de la limite utilisateurs.',
              messageAr: 'أنت قريب من حد المستخدمين.',
            };
    return {
      allowed: true,
      level: 'warning',
      ...warn,
      used,
      limit: safeLimit,
      percent: clamped,
    };
  }
  return { allowed: true, level: 'ok', used, limit: safeLimit, percent: clamped };
}

export function syncInvoiceUsageCount(invoiceCount: number): void {
  if (isAtlasSupabaseDataEnabled()) {
    void refreshAtlasUsageState();
    return;
  }
  const plan = getActivePlan();
  if (!plan?.invoicesLimit || plan.invoicesLimit.kind !== 'fixed') return;
  const u = getUsage();
  setUsage({ ...u, invoices: normalizeNumber(invoiceCount) });
}

export function syncCompanyUsageCount(companyCount: number): void {
  if (isAtlasSupabaseDataEnabled()) {
    void refreshAtlasUsageState();
    return;
  }
  const plan = getActivePlan();
  if (!plan) return;
  if (plan.companiesLimit.kind !== 'fixed') return;
  const u = getUsage();
  setUsage({ ...u, companies: normalizeNumber(companyCount) });
}

export function canCreateCompany(): LimitDecision {
  const plan = getActivePlan();
  const limits = getEffectivePlanLimits(plan);
  const count = isAtlasSupabaseDataEnabled()
    ? usageSnapshot.companies
    : typeof window !== 'undefined'
      ? readCompaniesFromLocalStorage().length
      : getUsage().companies;
  const decision = decideHard(count, limits.companies, 'company');
  if (!decision.allowed && plan?.id === 'pro' && limits.companies !== null) {
    return {
      ...decision,
      messageFr: `Vous avez atteint la limite de ${limits.companies} entreprises`,
      messageAr: `لقد وصلت إلى حد ${limits.companies} شركة`,
    };
  }
  if (!decision.allowed && plan && plan.id !== 'free-trial' && plan.billingPeriod !== 'trial') {
    return {
      ...decision,
      messageFr: 'Limite du nombre de sociétés atteinte pour votre forfait.',
      messageAr: 'تم بلوغ حد عدد الشركات لهذه الباقة.',
    };
  }
  return decision;
}

export function canInviteUser(): LimitDecision {
  const plan = getActivePlan();
  const limits = getPlanLimits(plan);
  const usage = getUsage();
  return decideHard(usage.users, limits.users, 'user');
}

export function canCreateInvoice(): LimitDecision {
  const plan = getActivePlan();
  const limits = getPlanLimits(plan);
  const usage = getUsage();
  return decideHard(usage.invoices, limits.invoices, 'invoice');
}

export function canPerformOperation(): LimitDecision {
  const plan = getActivePlan();
  const limits = getPlanLimits(plan);
  const usage = getUsage();
  return decideSoft(usage.operations, limits.operations);
}

export type TrialCountdown = {
  isTrial: boolean;
  daysLeft: number;
  endDateYmd: string | null;
};

export function getTrialCountdown(): TrialCountdown {
  const sub = readActiveSubscriptions().find(
    (s) => (s?.status === 'trial' || s?.planId === 'free-trial') && typeof s?.endDate === 'string',
  );
  if (!sub?.endDate) return { isTrial: false, daysLeft: 0, endDateYmd: null };
  const today = todayYmd();
  const end = sub.endDate;
  const toUtc = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map((x) => Number.parseInt(x, 10));
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((toUtc(end) - toUtc(today)) / (24 * 60 * 60 * 1000));
  return { isTrial: true, daysLeft: Math.max(0, diff), endDateYmd: end };
}
