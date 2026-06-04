/**
 * Phase 15 — Workspace billing server helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasSubscriptionPlan,
  BillingUsageSummary,
  FeatureCode,
  PlanCode,
  SubscriptionStatus,
  WorkspaceSubscription,
} from '@/app/types/atlas-billing';
import { ATLAS_FEATURE_CODES, DEFAULT_TRIAL_DAYS } from '@/app/types/atlas-billing';
import { getOrCreateDefaultWorkspace } from '@/app/lib/atlas-workspace-server';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  active: boolean;
};

type FeatureRow = { feature_code: string; limit_value: number | null };

type SubRow = {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
};

export async function listSubscriptionPlans(db: SupabaseClient): Promise<AtlasSubscriptionPlan[]> {
  const { data: plans } = await db
    .from('atlas_subscription_plans')
    .select('*')
    .eq('active', true)
    .order('monthly_price');

  const { data: features } = await db.from('atlas_plan_features').select('plan_id, feature_code, limit_value');

  const byPlan = new Map<string, Record<FeatureCode, number | null>>();
  for (const f of features ?? []) {
    const pid = String(f.plan_id);
    if (!byPlan.has(pid)) {
      byPlan.set(pid, Object.fromEntries(ATLAS_FEATURE_CODES.map((c) => [c, null])) as Record<FeatureCode, number | null>);
    }
    const bucket = byPlan.get(pid)!;
    if (ATLAS_FEATURE_CODES.includes(f.feature_code as FeatureCode)) {
      bucket[f.feature_code as FeatureCode] = f.limit_value;
    }
  }

  return (plans ?? []).map((p: PlanRow) => ({
    id: String(p.id),
    code: p.code as PlanCode,
    name: p.name,
    description: p.description,
    monthlyPrice: Number(p.monthly_price),
    yearlyPrice: Number(p.yearly_price),
    currency: p.currency,
    active: p.active,
    features: byPlan.get(String(p.id)) ?? Object.fromEntries(ATLAS_FEATURE_CODES.map((c) => [c, null])) as Record<FeatureCode, number | null>,
  }));
}

export async function getPlanByCode(db: SupabaseClient, code: PlanCode): Promise<AtlasSubscriptionPlan | null> {
  const plans = await listSubscriptionPlans(db);
  return plans.find((p) => p.code === code) ?? null;
}

export async function ensureWorkspaceSubscription(
  db: SupabaseClient,
  userId: string,
  workspaceId?: string | null,
): Promise<{ workspaceId: string; subscription: WorkspaceSubscription }> {
  const ws = workspaceId
    ? { id: workspaceId }
    : await getOrCreateDefaultWorkspace(db, userId);

  const { data: existing } = await db
    .from('atlas_workspace_subscriptions')
    .select('*')
    .eq('workspace_id', ws.id)
    .in('status', ['trial', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const sub = await mapSubscription(db, existing as SubRow);
    return { workspaceId: ws.id, subscription: sub };
  }

  const freePlan = await getPlanByCode(db, 'FREE');
  if (!freePlan) throw new Error('FREE plan not seeded');

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + DEFAULT_TRIAL_DAYS);

  const { data: inserted, error } = await db
    .from('atlas_workspace_subscriptions')
    .insert({
      workspace_id: ws.id,
      plan_id: freePlan.id,
      status: 'trial',
      trial_ends_at: trialEnds.toISOString(),
      expires_at: trialEnds.toISOString(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    entityType: 'routing_record',
    entityId: ws.id,
    action: 'created',
    performedBy: userId,
    metadata: { event: 'trial_start', workspace_id: ws.id, trial_days: DEFAULT_TRIAL_DAYS },
  });

  return { workspaceId: ws.id, subscription: await mapSubscription(db, inserted as SubRow) };
}

async function mapSubscription(db: SupabaseClient, row: SubRow): Promise<WorkspaceSubscription> {
  const { data: plan } = await db
    .from('atlas_subscription_plans')
    .select('code, name')
    .eq('id', row.plan_id)
    .maybeSingle();

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    planId: String(row.plan_id),
    planCode: (plan?.code ?? 'FREE') as PlanCode,
    planName: String(plan?.name ?? 'Free'),
    status: row.status as SubscriptionStatus,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    cancelledAt: row.cancelled_at,
    trialEndsAt: row.trial_ends_at,
  };
}

export async function getWorkspaceSubscription(
  db: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceSubscription | null> {
  const { data } = await db
    .from('atlas_workspace_subscriptions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return mapSubscription(db, data as SubRow);
}

export async function changeWorkspacePlan(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
  planCode: PlanCode,
): Promise<WorkspaceSubscription> {
  const plan = await getPlanByCode(db, planCode);
  if (!plan) throw new Error('plan_not_found');

  const current = await getWorkspaceSubscription(db, workspaceId);
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('atlas_workspace_subscriptions')
    .insert({
      workspace_id: workspaceId,
      plan_id: plan.id,
      status: planCode === 'FREE' ? 'trial' : 'active',
      started_at: now,
      trial_ends_at: planCode === 'FREE' ? new Date(Date.now() + DEFAULT_TRIAL_DAYS * 86400000).toISOString() : null,
      expires_at: null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  if (current?.id) {
    await db
      .from('atlas_workspace_subscriptions')
      .update({ status: 'cancelled', cancelled_at: now })
      .eq('id', current.id);
  }

  await logAuditEvent({
    entityType: 'routing_record',
    entityId: workspaceId,
    action: 'reviewed',
    performedBy: userId,
    metadata: {
      event: 'plan_change',
      from_plan: current?.planCode ?? null,
      to_plan: planCode,
      workspace_id: workspaceId,
    },
  });

  return mapSubscription(db, data as SubRow);
}

export async function recordUsageEvent(
  db: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    featureCode: FeatureCode;
    quantity?: number;
    companyId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.from('atlas_usage_events').insert({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    company_id: params.companyId ?? null,
    feature_code: params.featureCode,
    quantity: params.quantity ?? 1,
    metadata: params.metadata ?? {},
  });
}

export async function countUsageThisMonth(
  db: SupabaseClient,
  workspaceId: string,
  featureCode: FeatureCode,
): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { data } = await db
    .from('atlas_usage_events')
    .select('quantity')
    .eq('workspace_id', workspaceId)
    .eq('feature_code', featureCode)
    .gte('created_at', start.toISOString());

  return (data ?? []).reduce((s, r) => s + Number(r.quantity ?? 0), 0);
}

export async function countCompaniesInWorkspace(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<number> {
  const { count } = await db
    .from('atlas_companies')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  return count ?? 0;
}

export type { BillingUsageSummary };
