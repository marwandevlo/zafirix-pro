import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureWorkspaceSubscription, recordUsageEvent } from '@/app/lib/atlas-billing-server';
import { shouldBypassBillingEnforcement } from '@/app/lib/atlas-billing-bypass';
import type { FeatureCode } from '@/app/types/atlas-billing';
import {
  FREE_TIER_LIMITS,
  buildMeterSnapshot,
  isPaidFreemiumPlan,
  upgradeMessageFr,
  type FreemiumCheck,
  type FreemiumMeter,
  type FreemiumPlan,
  type FreemiumSnapshot,
} from '@/app/lib/atlas-freemium';

const METER_TO_FEATURE: Record<Exclude<FreemiumMeter, 'team'>, FeatureCode> = {
  invoices: 'invoices_quotes_per_month',
  cod: 'cod_shipments_per_month',
  ai_scans: 'ocr_limit',
};

type RpcRow = {
  allowed?: boolean;
  unlimited?: boolean;
  plan?: string;
  plan_code?: string;
  meter?: string;
  used?: number;
  limit?: number | null;
  remaining?: number | null;
  period_ym?: string;
  code?: string;
  message_fr?: string | null;
};

function periodYm(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function asPlan(planCode: string | null | undefined): FreemiumPlan {
  return isPaidFreemiumPlan(planCode) ? 'pro' : 'free';
}

function mapCheck(meter: FreemiumMeter, row: RpcRow, planCode: string): FreemiumCheck {
  const unlimited = Boolean(row.unlimited);
  const used = Number(row.used ?? 0);
  const limit = unlimited ? null : Number(row.limit ?? FREE_TIER_LIMITS[meter]);
  const allowed = Boolean(row.allowed);
  return {
    allowed,
    upgradeRequired: !allowed && !unlimited,
    plan: asPlan(row.plan_code ?? planCode),
    planCode: String(row.plan_code ?? planCode),
    meter,
    used,
    limit,
    remaining: unlimited ? null : Math.max(0, (limit ?? 0) - used),
    unlimited,
    code: row.code,
    messageFr: row.message_fr ?? (!allowed ? upgradeMessageFr(meter, used, limit ?? FREE_TIER_LIMITS[meter]) : undefined),
  };
}

async function resolveWorkspace(db: SupabaseClient, userId: string, workspaceId?: string | null) {
  return ensureWorkspaceSubscription(db, userId, workspaceId);
}

export async function getFreemiumSnapshot(
  db: SupabaseClient,
  userId: string,
  workspaceId?: string | null,
): Promise<FreemiumSnapshot> {
  const { workspaceId: wsId, subscription } = await resolveWorkspace(db, userId, workspaceId);
  const paid = isPaidFreemiumPlan(subscription.planCode) || (await shouldBypassBillingEnforcement(db, userId));
  const period = periodYm();

  let invoices = 0;
  let cod = 0;
  let scans = 0;

  const { data, error } = await db
    .from('atlas_workspace_usage_cycles')
    .select('current_month_invoices, current_month_cod, current_month_ai_scans, period_ym')
    .eq('workspace_id', wsId)
    .eq('period_ym', period)
    .maybeSingle();

  if (!error && data) {
    invoices = Number(data.current_month_invoices ?? 0);
    cod = Number(data.current_month_cod ?? 0);
    scans = Number(data.current_month_ai_scans ?? 0);
  } else {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const { data: events } = await db
      .from('atlas_usage_events')
      .select('feature_code, quantity')
      .eq('workspace_id', wsId)
      .gte('created_at', start);
    for (const ev of events ?? []) {
      const qty = Number(ev.quantity ?? 0);
      if (ev.feature_code === 'invoices_quotes_per_month' || ev.feature_code === 'invoice_created') invoices += qty;
      if (ev.feature_code === 'cod_shipments_per_month') cod += qty;
      if (ev.feature_code === 'ocr_limit') scans += qty;
    }
  }

  return {
    plan: paid ? 'pro' : 'free',
    planCode: subscription.planCode,
    periodYm: period,
    teamMembers: 1,
    meters: [
      buildMeterSnapshot('invoices', invoices, paid),
      buildMeterSnapshot('cod', cod, paid),
      buildMeterSnapshot('ai_scans', scans, paid),
      buildMeterSnapshot('team', 1, paid),
    ],
  };
}

export async function checkFreemiumMeter(
  db: SupabaseClient,
  userId: string,
  meter: FreemiumMeter,
  quantity = 1,
  workspaceId?: string | null,
): Promise<FreemiumCheck> {
  if (await shouldBypassBillingEnforcement(db, userId)) {
    return {
      allowed: true,
      upgradeRequired: false,
      plan: 'pro',
      meter,
      used: 0,
      limit: null,
      remaining: null,
      unlimited: true,
      code: 'bypass',
    };
  }

  const { workspaceId: wsId, subscription } = await resolveWorkspace(db, userId, workspaceId);
  const { data, error } = await db.rpc('atlas_freemium_check', {
    p_workspace_id: wsId,
    p_meter: meter,
    p_qty: quantity,
  });

  if (!error && data) {
    const row = (Array.isArray(data) ? data[0] : data) as RpcRow;
    return mapCheck(meter, row, subscription.planCode);
  }

  const snapshot = await getFreemiumSnapshot(db, userId, wsId);
  const row = snapshot.meters.find((m) => m.meter === meter)!;
  const allowed = row.unlimited || (row.remaining ?? 0) >= quantity;
  return {
    allowed,
    upgradeRequired: !allowed,
    plan: snapshot.plan,
    planCode: snapshot.planCode,
    meter,
    used: row.used,
    limit: row.limit,
    remaining: row.remaining,
    unlimited: row.unlimited,
    code: allowed ? 'ok' : 'quota_exceeded',
    messageFr: allowed
      ? undefined
      : upgradeMessageFr(meter, row.used, row.limit ?? FREE_TIER_LIMITS[meter]),
  };
}

export async function consumeFreemiumMeter(
  db: SupabaseClient,
  userId: string,
  meter: FreemiumMeter,
  quantity = 1,
  workspaceId?: string | null,
): Promise<FreemiumCheck> {
  const check = await checkFreemiumMeter(db, userId, meter, quantity, workspaceId);
  if (!check.allowed) return check;

  const { workspaceId: wsId, subscription } = await resolveWorkspace(db, userId, workspaceId);
  const { data, error } = await db.rpc('atlas_freemium_consume', {
    p_workspace_id: wsId,
    p_meter: meter,
    p_qty: quantity,
  });

  if (!error && data) {
    const row = (Array.isArray(data) ? data[0] : data) as RpcRow;
    return mapCheck(meter, row, subscription.planCode);
  }

  if (meter !== 'team') {
    await recordUsageEvent(db, {
      workspaceId: wsId,
      userId,
      featureCode: METER_TO_FEATURE[meter],
      quantity,
      metadata: { event_type: 'freemium_consume_fallback', meter },
    }).catch(() => undefined);
  }

  return {
    ...check,
    used: check.used + quantity,
    remaining: check.limit === null ? null : Math.max(0, check.limit - check.used - quantity),
  };
}

export function freemiumDeniedResponse(check: FreemiumCheck) {
  return {
    ok: false,
    error: 'quota_exceeded',
    upgradeRequired: true,
    plan: check.plan,
    meter: check.meter,
    used: check.used,
    limit: check.limit,
    remaining: check.remaining,
    message: check.messageFr,
    messageFr: check.messageFr,
  };
}
