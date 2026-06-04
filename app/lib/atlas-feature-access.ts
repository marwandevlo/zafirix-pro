/**
 * Phase 15 — Feature access & quota engine (config-driven, workspace-scoped).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingUsageSummary, FeatureCode, FeatureQuota } from '@/app/types/atlas-billing';
import { ATLAS_FEATURE_CODES } from '@/app/types/atlas-billing';
import {
  countCompaniesInWorkspace,
  countUsageThisMonth,
  ensureWorkspaceSubscription,
  getPlanByCode,
  listSubscriptionPlans,
} from '@/app/lib/atlas-billing-server';
import { computeTrialStatus } from '@/app/lib/atlas-trial-manager';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';

export type FeatureAccessResult = {
  allowed: boolean;
  featureCode: FeatureCode;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  messageFr?: string;
};

export async function hasPlanFeature(
  db: SupabaseClient,
  workspaceId: string,
  featureCode: FeatureCode,
): Promise<boolean> {
  const summary = await buildBillingUsageSummary(db, '', workspaceId);
  const q = summary.quotas.find((x) => x.featureCode === featureCode);
  return !!q && (q.unlimited || q.remaining === null || q.remaining > 0);
}

export async function getRemainingQuota(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
  featureCode: FeatureCode,
): Promise<FeatureQuota> {
  const summary = await buildBillingUsageSummary(db, userId, workspaceId);
  return summary.quotas.find((q) => q.featureCode === featureCode) ?? {
    featureCode,
    limit: null,
    used: 0,
    remaining: null,
    unlimited: true,
    allowed: true,
  };
}

export async function canUseFeature(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
  featureCode: FeatureCode,
  quantity = 1,
): Promise<FeatureAccessResult> {
  const quota = await getRemainingQuota(db, userId, workspaceId, featureCode);
  const summary = await buildBillingUsageSummary(db, userId, workspaceId);

  if (summary.trialExpired && summary.subscription?.status === 'trial') {
    return {
      allowed: false,
      featureCode,
      limit: quota.limit,
      used: quota.used,
      remaining: 0,
      unlimited: false,
      messageFr: 'Votre essai a expiré. Passez à une offre supérieure pour continuer.',
    };
  }

  if (quota.unlimited || quota.limit === null) {
    return { allowed: true, featureCode, limit: null, used: quota.used, remaining: null, unlimited: true };
  }

  const remaining = Math.max(0, (quota.limit ?? 0) - quota.used);
  const allowed = remaining >= quantity;

  if (!allowed) {
    await logAuditEvent({
      entityType: 'routing_record',
      entityId: workspaceId,
      action: 'reviewed',
      performedBy: userId,
      metadata: { event: 'quota_violation', feature_code: featureCode, used: quota.used, limit: quota.limit },
    }).catch(() => undefined);
  }

  return {
    allowed,
    featureCode,
    limit: quota.limit,
    used: quota.used,
    remaining,
    unlimited: false,
    messageFr: allowed
      ? undefined
      : `Quota ${featureCode} atteint (${quota.used}/${quota.limit}). Passez à une offre supérieure.`,
  };
}

export async function buildBillingUsageSummary(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<BillingUsageSummary> {
  let sub: BillingUsageSummary['subscription'] = null;

  if (userId) {
    const ensured = await ensureWorkspaceSubscription(db, userId, workspaceId);
    sub = ensured.subscription;
    workspaceId = ensured.workspaceId;
  } else {
    const { getWorkspaceSubscription } = await import('@/app/lib/atlas-billing-server');
    sub = await getWorkspaceSubscription(db, workspaceId);
  }

  const plans = await listSubscriptionPlans(db);
  const plan = sub ? plans.find((p) => p.id === sub!.planId) : plans.find((p) => p.code === 'FREE');
  const trial = computeTrialStatus(sub?.trialEndsAt ?? null, sub?.status ?? null);

  const quotas: FeatureQuota[] = [];
  for (const code of ATLAS_FEATURE_CODES) {
    const limit = plan?.features[code] ?? null;
    let used = 0;
    if (code === 'companies_limit' && userId) {
      used = await countCompaniesInWorkspace(db, userId, workspaceId);
    } else {
      used = await countUsageThisMonth(db, workspaceId, code);
    }
    const unlimited = limit === null;
    const remaining = unlimited ? null : Math.max(0, limit - used);
    quotas.push({
      featureCode: code,
      limit,
      used,
      remaining,
      unlimited,
      allowed: unlimited || (remaining !== null && remaining > 0),
    });
  }

  return {
    workspaceId,
    subscription: sub,
    quotas,
    trialDaysRemaining: trial.daysRemaining,
    trialExpired: trial.expired,
  };
}

export async function listPlansForComparison(db: SupabaseClient) {
  return listSubscriptionPlans(db);
}
