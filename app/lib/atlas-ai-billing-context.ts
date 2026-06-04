/**
 * Phase 15 — Billing context for AI copilot.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBillingUsageSummary } from '@/app/lib/atlas-feature-access';
import { computeTrialStatus } from '@/app/lib/atlas-trial-manager';
import { getOrCreateDefaultWorkspace } from '@/app/lib/atlas-workspace-server';
import { FEATURE_LABELS_FR } from '@/app/types/atlas-billing';

export type BillingAiContext = {
  workspace_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  trial: { days_remaining: number | null; expired: boolean; label: string };
  quotas: Array<{ feature: string; label: string; used: number; limit: number | null; remaining: number | null }>;
  insights: string[];
};

export async function buildBillingAiContext(
  db: SupabaseClient,
  userId: string,
  workspaceId?: string | null,
): Promise<BillingAiContext> {
  const ws = workspaceId
    ? { id: workspaceId }
    : await getOrCreateDefaultWorkspace(db, userId);

  const summary = await buildBillingUsageSummary(db, userId, ws.id);
  const trial = computeTrialStatus(summary.subscription?.trialEndsAt ?? null, summary.subscription?.status ?? null);

  const quotas = summary.quotas.map((q) => ({
    feature: q.featureCode,
    label: FEATURE_LABELS_FR[q.featureCode],
    used: q.used,
    limit: q.limit,
    remaining: q.remaining,
  }));

  const insights: string[] = [];
  const ai = summary.quotas.find((q) => q.featureCode === 'ai_requests_limit');
  if (ai && !ai.unlimited && ai.remaining !== null) {
    insights.push(`Requêtes IA restantes: ${ai.remaining}/${ai.limit}`);
  }
  const companies = summary.quotas.find((q) => q.featureCode === 'companies_limit');
  if (companies && !companies.unlimited && companies.remaining !== null && companies.remaining === 0) {
    insights.push('Impossible de créer une société supplémentaire sans upgrade.');
  }
  if (trial.active) {
    insights.push(`Essai: ${trial.labelFr}`);
  }

  return {
    workspace_id: ws.id,
    plan_code: summary.subscription?.planCode ?? 'FREE',
    plan_name: summary.subscription?.planName ?? 'Free',
    status: summary.subscription?.status ?? 'trial',
    trial: { days_remaining: trial.daysRemaining, expired: trial.expired, label: trial.labelFr },
    quotas,
    insights,
  };
}

export function billingContextToPromptBlock(ctx: BillingAiContext): string {
  return `[ABONNEMENT / QUOTAS]\n${JSON.stringify(ctx, null, 2)}`;
}
