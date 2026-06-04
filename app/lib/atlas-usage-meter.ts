/**
 * Phase 16 — Server-side usage metering (quota check + atlas_usage_events).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { canUseFeature } from '@/app/lib/atlas-feature-access';
import { ensureWorkspaceSubscription, recordUsageEvent } from '@/app/lib/atlas-billing-server';
import { USAGE_EVENT_TO_FEATURE } from '@/app/types/atlas-billing';

export type UsageEventType = keyof typeof USAGE_EVENT_TO_FEATURE;

export type MeterResult =
  | { ok: true; workspaceId: string }
  | { ok: false; status: 403 | 429; code: string; messageFr?: string };

export async function meterFeatureUsage(
  db: SupabaseClient,
  userId: string,
  eventType: UsageEventType,
  opts?: {
    workspaceId?: string | null;
    companyId?: string | null;
    quantity?: number;
    enforceQuota?: boolean;
  },
): Promise<MeterResult> {
  const featureCode = USAGE_EVENT_TO_FEATURE[eventType];
  if (!featureCode) return { ok: false, status: 403, code: 'unknown_usage_event' };

  const { workspaceId } = await ensureWorkspaceSubscription(db, userId, opts?.workspaceId ?? null);
  const quantity = opts?.quantity ?? 1;
  const enforce = opts?.enforceQuota !== false;

  if (enforce) {
    const access = await canUseFeature(db, userId, workspaceId, featureCode, quantity);
    if (!access.allowed) {
      return {
        ok: false,
        status: 429,
        code: 'quota_exceeded',
        messageFr: access.messageFr,
      };
    }
  }

  await recordUsageEvent(db, {
    workspaceId,
    userId,
    featureCode,
    quantity,
    companyId: opts?.companyId ?? null,
    metadata: { event_type: eventType },
  });

  return { ok: true, workspaceId };
}

export async function recordUsageOnly(
  db: SupabaseClient,
  userId: string,
  eventType: UsageEventType,
  opts?: { workspaceId?: string | null; companyId?: string | null; quantity?: number },
): Promise<string> {
  const result = await meterFeatureUsage(db, userId, eventType, { ...opts, enforceQuota: false });
  if (!result.ok) throw new Error(result.code);
  return result.workspaceId;
}
