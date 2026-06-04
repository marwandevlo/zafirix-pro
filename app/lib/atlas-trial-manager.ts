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
  const { data: expired } = await db
    .from('atlas_workspace_subscriptions')
    .select('id, workspace_id, trial_ends_at')
    .eq('status', 'trial')
    .lt('trial_ends_at', now);

  let count = 0;
  for (const row of expired ?? []) {
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
