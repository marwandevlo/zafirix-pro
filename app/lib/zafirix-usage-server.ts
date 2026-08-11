/**
 * Server-side Zafirix usage meters: check limits, consume, add-ons.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ZafirixAddonPack,
  ZafirixMeterCode,
  ZafirixMeterSnapshot,
  ZafirixPlanCode,
  ZafirixSubscription,
  ZafirixUsageCheck,
  ZafirixUsageSummary,
} from '@/app/types/zafirix-usage';
import {
  ZAFIRIX_METER_CODES,
  ZAFIRIX_METER_LABELS_FR,
  ZAFIRIX_PLAN_LABELS_FR,
  ZAFIRIX_PLAN_UPGRADE,
} from '@/app/types/zafirix-usage';
import { shouldBypassBillingEnforcement } from '@/app/lib/atlas-billing-bypass';

type RpcCheck = {
  allowed?: boolean;
  unlimited?: boolean;
  used?: number;
  limit?: number | null;
  included_limit?: number | null;
  addon_bonus?: number;
  remaining?: number | null;
  plan_code?: string;
  period_ym?: string;
  code?: string;
  message_fr?: string | null;
  ok?: boolean;
};

function periodYm(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function asPlanCode(v: unknown): ZafirixPlanCode {
  const s = String(v ?? 'INDEPENDANT');
  if (s === 'PERSONNE_PHYSIQUE' || s === 'PME' || s === 'ULTIMATE' || s === 'INDEPENDANT') return s;
  return 'INDEPENDANT';
}

function mapPack(row: Record<string, unknown>): ZafirixAddonPack {
  return {
    code: String(row.code),
    nameFr: String(row.name_fr ?? row.code),
    descriptionFr: String(row.description_fr ?? ''),
    meterCode: String(row.meter_code) as ZafirixMeterCode,
    quantity: Number(row.quantity) || 0,
    priceMad: Number(row.price_mad) || 0,
  };
}

function mapSubscription(row: Record<string, unknown>): ZafirixSubscription {
  const planCode = asPlanCode(row.plan_code);
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    ownerUserId: String(row.owner_user_id),
    planCode,
    planLabel: ZAFIRIX_PLAN_LABELS_FR[planCode],
    status: (row.status as ZafirixSubscription['status']) ?? 'trial',
    billingCycle: row.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
    trialEndsAt: row.trial_ends_at ? String(row.trial_ends_at) : null,
    currentPeriodStart: String(row.current_period_start ?? ''),
    currentPeriodEnd: String(row.current_period_end ?? ''),
  };
}

function meterSnapshot(
  meterCode: ZafirixMeterCode,
  used: number,
  includedLimit: number | null,
  addonBonus: number,
): ZafirixMeterSnapshot {
  const unlimited = includedLimit === null;
  const effectiveLimit = unlimited ? null : includedLimit + addonBonus;
  const remaining = unlimited || effectiveLimit === null ? null : Math.max(0, effectiveLimit - used);
  const pct =
    unlimited || !effectiveLimit || effectiveLimit <= 0
      ? null
      : Math.min(1, Math.max(0, used / effectiveLimit));
  return {
    meterCode,
    label: ZAFIRIX_METER_LABELS_FR[meterCode],
    used,
    includedLimit,
    addonBonus,
    effectiveLimit,
    remaining,
    unlimited,
    pct,
    nearLimit: pct !== null && pct >= 0.8,
    exceeded: !unlimited && remaining !== null && remaining <= 0,
  };
}

export async function listZafirixAddonPacks(
  db: SupabaseClient,
  meterCode?: ZafirixMeterCode,
): Promise<ZafirixAddonPack[]> {
  let q = db.from('zafirix_addon_packs').select('*').eq('active', true).order('sort_order');
  if (meterCode) q = q.eq('meter_code', meterCode);
  const { data, error } = await q;
  if (error) {
    if (/zafirix_addon_packs|schema cache|does not exist/i.test(error.message)) return [];
    console.warn('[zafirix-usage] list packs:', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapPack(r as Record<string, unknown>));
}

export async function ensureZafirixSubscription(
  db: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<ZafirixSubscription | null> {
  const { data, error } = await db.rpc('zafirix_ensure_subscription', {
    p_company_id: companyId,
    p_user_id: userId,
  });
  if (error) {
    if (/zafirix_ensure_subscription|schema cache|does not exist/i.test(error.message)) return null;
    console.warn('[zafirix-usage] ensure subscription:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return mapSubscription(row as Record<string, unknown>);
}

export async function checkZafirixUsage(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  meter: ZafirixMeterCode,
  quantity = 1,
): Promise<ZafirixUsageCheck> {
  if (await shouldBypassBillingEnforcement(db, userId)) {
    return { allowed: true, unlimited: true, code: 'bypass' };
  }

  const { data, error } = await db.rpc('zafirix_check_usage', {
    p_company_id: companyId,
    p_meter: meter,
    p_qty: quantity,
  });

  if (error) {
    // Soft-fail open if migration not applied yet (avoid blocking production mid-deploy).
    if (/zafirix_check_usage|schema cache|does not exist/i.test(error.message)) {
      return { allowed: true, unlimited: true, code: 'metering_unavailable' };
    }
    return { allowed: false, code: 'check_failed', messageFr: error.message };
  }

  const raw = (Array.isArray(data) ? data[0] : data) as RpcCheck | null;
  if (!raw) return { allowed: true, code: 'empty' };

  const planCode = asPlanCode(raw.plan_code);
  const check: ZafirixUsageCheck = {
    allowed: !!raw.allowed,
    unlimited: !!raw.unlimited,
    used: raw.used,
    limit: raw.limit ?? null,
    includedLimit: raw.included_limit ?? null,
    addonBonus: raw.addon_bonus,
    remaining: raw.remaining ?? null,
    planCode,
    periodYm: raw.period_ym,
    code: raw.code,
    messageFr: raw.message_fr ?? undefined,
    upgradeTo: ZAFIRIX_PLAN_UPGRADE[planCode] ?? null,
  };

  if (!check.allowed) {
    check.suggestedAddons = await listZafirixAddonPacks(db, meter);
  }

  return check;
}

/**
 * Pre-check only (triggers consume on insert for invoices/shipments).
 * For AI/docs without DB triggers, call consumeZafirixUsage after success.
 */
export async function assertZafirixUsageOrThrow(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  meter: ZafirixMeterCode,
  quantity = 1,
): Promise<ZafirixUsageCheck> {
  const check = await checkZafirixUsage(db, userId, companyId, meter, quantity);
  if (!check.allowed) return check;
  return check;
}

export async function consumeZafirixUsage(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  meter: ZafirixMeterCode,
  quantity = 1,
): Promise<ZafirixUsageCheck> {
  if (await shouldBypassBillingEnforcement(db, userId)) {
    return { allowed: true, unlimited: true, code: 'bypass' };
  }

  const { data, error } = await db.rpc('zafirix_consume_usage', {
    p_company_id: companyId,
    p_meter: meter,
    p_qty: quantity,
  });

  if (error) {
    if (/zafirix_consume_usage|schema cache|does not exist/i.test(error.message)) {
      return { allowed: true, unlimited: true, code: 'metering_unavailable' };
    }
    if (/zafirix_quota_exceeded/i.test(error.message)) {
      return {
        allowed: false,
        code: 'quota_exceeded',
        messageFr: error.message.replace(/^zafirix_quota_exceeded:\s*/i, ''),
        suggestedAddons: await listZafirixAddonPacks(db, meter),
      };
    }
    return { allowed: false, code: 'consume_failed', messageFr: error.message };
  }

  const raw = (Array.isArray(data) ? data[0] : data) as RpcCheck | null;
  if (!raw) return { allowed: true, code: 'empty' };

  const planCode = asPlanCode(raw.plan_code);
  return {
    allowed: !!raw.allowed || !!raw.ok,
    used: raw.used,
    limit: raw.limit ?? null,
    remaining: raw.remaining ?? null,
    planCode,
    periodYm: raw.period_ym,
    code: raw.code,
    messageFr: raw.message_fr ?? undefined,
    upgradeTo: ZAFIRIX_PLAN_UPGRADE[planCode] ?? null,
    suggestedAddons: raw.allowed === false ? await listZafirixAddonPacks(db, meter) : undefined,
  };
}

export async function changeZafirixPlan(
  db: SupabaseClient,
  companyId: string,
  userId: string,
  planCode: ZafirixPlanCode,
): Promise<{ ok: true; subscription: ZafirixSubscription } | { ok: false; error: string }> {
  const ensured = await ensureZafirixSubscription(db, companyId, userId);
  if (!ensured) return { ok: false, error: 'subscription_unavailable' };

  const { data, error } = await db
    .from('zafirix_subscriptions')
    .update({
      plan_code: planCode,
      status: 'active',
      updated_at: new Date().toISOString(),
      trial_ends_at: null,
    })
    .eq('id', ensured.id)
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' };

  // Refresh included limits for current period meters
  for (const meter of ZAFIRIX_METER_CODES) {
    await db.rpc('zafirix_ensure_meter_row', {
      p_company_id: companyId,
      p_meter: meter,
      p_period_ym: periodYm(),
    });
  }

  // Force included_limit from new plan
  const { data: limits } = await db
    .from('zafirix_plan_limits')
    .select('meter_code, limit_value')
    .eq('plan_code', planCode);

  for (const lim of limits ?? []) {
    await db
      .from('zafirix_usage_meters')
      .update({
        included_limit: lim.limit_value as number | null,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('period_ym', periodYm())
      .eq('meter_code', lim.meter_code);
  }

  return { ok: true, subscription: mapSubscription(data as Record<string, unknown>) };
}

export async function requestZafirixAddon(
  db: SupabaseClient,
  params: {
    companyId: string;
    userId: string;
    packCode: string;
    /** When true (dev/bypass/admin), activate immediately without payment. */
    activateNow?: boolean;
  },
): Promise<
  | { ok: true; purchaseId: string; status: string; activated: boolean }
  | { ok: false; error: string; messageFr?: string }
> {
  const { data: pack, error: packErr } = await db
    .from('zafirix_addon_packs')
    .select('*')
    .eq('code', params.packCode)
    .eq('active', true)
    .maybeSingle();

  if (packErr || !pack) {
    return { ok: false, error: 'pack_not_found', messageFr: 'Pack introuvable.' };
  }

  await ensureZafirixSubscription(db, params.companyId, params.userId);
  const ym = periodYm();

  const { data: purchase, error } = await db
    .from('zafirix_addon_purchases')
    .insert({
      company_id: params.companyId,
      owner_user_id: params.userId,
      pack_code: params.packCode,
      period_ym: ym,
      quantity_granted: pack.quantity,
      price_mad: pack.price_mad,
      status: 'pending',
      metadata: { meter_code: pack.meter_code },
    })
    .select('id')
    .single();

  if (error || !purchase) {
    return { ok: false, error: 'purchase_failed', messageFr: error?.message };
  }

  const bypass = await shouldBypassBillingEnforcement(db, params.userId);
  const activateNow = params.activateNow || bypass;

  if (activateNow) {
    const { data: act } = await db.rpc('zafirix_activate_addon_purchase', {
      p_purchase_id: purchase.id,
    });
    const actRow = act as { ok?: boolean } | null;
    return {
      ok: true,
      purchaseId: String(purchase.id),
      status: 'active',
      activated: !!actRow?.ok || true,
    };
  }

  return {
    ok: true,
    purchaseId: String(purchase.id),
    status: 'pending',
    activated: false,
  };
}

export async function buildZafirixUsageSummary(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<ZafirixUsageSummary | null> {
  const sub = await ensureZafirixSubscription(db, companyId, userId);
  if (!sub) return null;

  const ym = periodYm();
  const meters: ZafirixMeterSnapshot[] = [];

  for (const meter of ZAFIRIX_METER_CODES) {
    await db.rpc('zafirix_ensure_meter_row', {
      p_company_id: companyId,
      p_meter: meter,
      p_period_ym: ym,
    });
  }

  const { data: rows } = await db
    .from('zafirix_usage_meters')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_ym', ym);

  const byCode = new Map(
    (rows ?? []).map((r) => [String((r as { meter_code: string }).meter_code), r as Record<string, unknown>]),
  );

  for (const code of ZAFIRIX_METER_CODES) {
    const r = byCode.get(code);
    meters.push(
      meterSnapshot(
        code,
        Number(r?.used_qty ?? 0),
        r?.included_limit == null ? null : Number(r.included_limit),
        Number(r?.addon_bonus_qty ?? 0),
      ),
    );
  }

  const addons = await listZafirixAddonPacks(db);
  const { count } = await db
    .from('zafirix_addon_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending');

  return {
    companyId,
    periodYm: ym,
    subscription: sub,
    meters,
    addons,
    pendingAddonPurchases: count ?? 0,
  };
}

export function isZafirixQuotaError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /zafirix_quota_exceeded|quota_exceeded/i.test(message);
}

export function quotaErrorMessageFr(message: string | undefined | null, fallback?: string): string {
  if (!message) return fallback ?? 'Quota atteint.';
  const cleaned = message.replace(/^.*zafirix_quota_exceeded:\s*/i, '').trim();
  return cleaned || fallback || 'Quota atteint. Achetez un pack ou passez à un forfait supérieur.';
}
