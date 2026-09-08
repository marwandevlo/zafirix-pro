/**
 * Phase 15 — Trial manager (14-day default trial).
 */

import type { SubscriptionStatus } from '@/app/types/atlas-billing';
import { DEFAULT_TRIAL_DAYS } from '@/app/types/atlas-billing';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';

export type TrialStatus = {
  active: boolean;
  expired: boolean;
  daysRemaining: number | null;
  endsAt: string | null;
  labelFr: string;
};

export function computeTrialStatus(
  trialEndsAt: string | null,
  status: SubscriptionStatus | string | null,
): TrialStatus {
  if (!trialEndsAt || status !== 'trial') {
    return { active: false, expired: false, daysRemaining: null, endsAt: null, labelFr: 'Hors essai' };
  }

  const end = new Date(trialEndsAt);
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(ms / 86400000));
  const expired = ms <= 0;

  return {
    active: !expired,
    expired,
    daysRemaining: expired ? 0 : daysRemaining,
    endsAt: trialEndsAt,
    labelFr: expired
      ? 'Essai expiré'
      : daysRemaining === 0
        ? 'Dernier jour d\'essai'
        : `${daysRemaining} jour(s) d'essai restant(s)`,
  };
}

export async function expireTrialsIfNeeded(db: SupabaseClient, userId: string): Promise<number> {
  const now = new Date().toISOString();
  let expired: Array<Record<string, unknown>> | null = null;
  const withOverride = await db
    .from('atlas_workspace_subscriptions')
    .select('id, workspace_id, trial_ends_at, admin_override, admin_override_until, metadata')
    .eq('status', 'trial')
    .lt('trial_ends_at', now);
  if (withOverride.error) {
    const fallback = await db
      .from('atlas_workspace_subscriptions')
      .select('id, workspace_id, trial_ends_at, metadata')
      .eq('status', 'trial')
      .lt('trial_ends_at', now);
    expired = (fallback.data ?? null) as Array<Record<string, unknown>> | null;
  } else {
    expired = (withOverride.data ?? null) as Array<Record<string, unknown>> | null;
  }

  let count = 0;
  for (const row of expired ?? []) {
    const override = Boolean((row as { admin_override?: boolean }).admin_override);
    const until = (row as { admin_override_until?: string | null }).admin_override_until ?? null;
    const meta = (row as { metadata?: Record<string, unknown> | null }).metadata;
    const metaOverride =
      meta?.admin_override === true ||
      meta?.permanent === true ||
      meta?.permanent_access === true ||
      String(meta?.source ?? '') === 'admin_plan_override';
    const metaUntil = meta?.admin_override_until ?? null;
    const activeOverride =
      (override || metaOverride) &&
      (!(until ?? metaUntil) || Date.parse(String(until ?? metaUntil)) > Date.now());
    if (activeOverride) continue;

    await db
      .from('atlas_workspace_subscriptions')
      .update({ status: 'expired' })
      .eq('id', row.id);
    await logAuditEvent({
      entityType: 'routing_record',
      entityId: String(row.workspace_id),
      action: 'reviewed',
      performedBy: userId,
      metadata: { event: 'trial_expiration', workspace_id: row.workspace_id },
    }).catch(() => undefined);
    count++;
  }
  return count;
}

export function trialCountdownLabel(daysRemaining: number | null): string {
  if (daysRemaining === null) return '';
  if (daysRemaining <= 0) return 'Essai terminé';
  if (daysRemaining === 1) return '1 jour restant';
  return `${daysRemaining} jours restants`;
}

export { DEFAULT_TRIAL_DAYS };
