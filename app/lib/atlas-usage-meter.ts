/**
 * Phase 16 — Server-side usage metering (quota check + atlas_usage_events).
 * Also mirrors AI/doc/OCR into company-scoped zafirix_usage_meters when companyId is set.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { canUseFeature } from '@/app/lib/atlas-feature-access';
import { ensureWorkspaceSubscription, recordUsageEvent } from '@/app/lib/atlas-billing-server';
import { USAGE_EVENT_TO_FEATURE } from '@/app/types/atlas-billing';
import { checkZafirixUsage, consumeZafirixUsage } from '@/app/lib/zafirix-usage-server';
import type { ZafirixMeterCode } from '@/app/types/zafirix-usage';

export type UsageEventType = keyof typeof USAGE_EVENT_TO_FEATURE;

export type MeterResult =
  | { ok: true; workspaceId: string }
  | { ok: false; status: 403 | 429; code: string; messageFr?: string; suggestedAddons?: unknown };

const EVENT_TO_ZAFIRIX_METER: Partial<Record<UsageEventType, ZafirixMeterCode>> = {
  ai_request: 'ai_requests',
  document_upload: 'documents',
  ocr_request: 'ocr',
  invoice_created: 'invoices',
};

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
  const zMeter = EVENT_TO_ZAFIRIX_METER[eventType];
  const companyId = opts?.companyId?.trim() || null;

  // Company pay-as-you-go meters — prefer when company scoped (AI/docs/OCR).
  // Invoices/shipments are consumed by DB triggers on insert.
  if (enforce && companyId && zMeter && zMeter !== 'invoices' && zMeter !== 'shipments') {
    const zCheck = await checkZafirixUsage(db, userId, companyId, zMeter, quantity);
    if (!zCheck.allowed) {
      return {
        ok: false,
        status: 429,
        code: 'quota_exceeded',
        messageFr: zCheck.messageFr,
        suggestedAddons: zCheck.suggestedAddons,
      };
    }
  }

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
    companyId,
    metadata: { event_type: eventType },
  });

  if (companyId && zMeter && zMeter !== 'invoices' && zMeter !== 'shipments') {
    await consumeZafirixUsage(db, userId, companyId, zMeter, quantity);
  }

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
