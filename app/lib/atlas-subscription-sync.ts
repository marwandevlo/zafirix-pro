/**
 * Sprint 2 — ZAFIRIX PRO billing integrity.
 * Canonical entitlement: `public.atlas_subscriptions` (time-bounded, status).
 * `profiles.plan` / `profiles.status` (non-suspended) are denormalized caches updated from this module only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ATLAS_PROFILE_PLANS,
  type AtlasProfilePlan,
} from '@/app/lib/admin/atlas-admin-profile-fields';
import { addDaysYmd, todayYmd } from '@/app/lib/atlas-dates';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';

export type AtlasEntitlementRow = {
  id?: string;
  plan_id: string;
  status: string;
  start_date: string;
  end_date: string;
  created_at?: string;
};

const PAID_RANK: Record<string, number> = {
  starter: 1,
  growth: 2,
  pro: 3,
  business: 4,
  advanced: 5,
  enterprise: 6,
};

function paidTierRank(planId: string): number {
  return PAID_RANK[planId.trim().toLowerCase()] ?? 0;
}

export function isDateWithinYmdInclusive(ymd: string, start: string, end: string): boolean {
  if (!ymd || !start || !end) return false;
  return ymd >= start && ymd <= end;
}

/** Map commercial atlas plan_id → profiles.plan enum (coarse buckets). */
export function atlasPlanIdToProfilePlan(planId: string): AtlasProfilePlan {
  const id = planId.trim().toLowerCase();
  if (id === 'free-trial') return 'free';
  if (id === 'enterprise') return 'enterprise';
  if (id === 'business' || id === 'advanced') return 'vip';
  return 'pro';
}

export function adminProfilePlanToCommercialAtlasPlanId(plan: string): string | null {
  const p = plan.trim().toLowerCase();
  if (p === 'free') return null;
  if (p === 'pro') return 'pro';
  if (p === 'vip') return 'business';
  if (p === 'enterprise') return 'enterprise';
  return null;
}

function isProfilePlanToken(p: string): p is AtlasProfilePlan {
  return (ATLAS_PROFILE_PLANS as readonly string[]).includes(p);
}

/** Rows that still grant access today (trial or paid, not cancelled / outside window). */
export function filterCurrentlyEffectiveRows(rows: AtlasEntitlementRow[], nowYmd = todayYmd()): AtlasEntitlementRow[] {
  return rows.filter(
    (r) =>
      (r.status === 'active' || r.status === 'trial') &&
      isDateWithinYmdInclusive(nowYmd, r.start_date, r.end_date),
  );
}

/**
 * Pick the single best commercial plan_id from effective rows, or trial, or none.
 */
export function resolveEffectiveEntitlement(rows: AtlasEntitlementRow[], nowYmd = todayYmd()): {
  kind: 'paid' | 'trial' | 'none';
  planId?: string;
} {
  const valid = filterCurrentlyEffectiveRows(rows, nowYmd);
  const paid = valid.filter((r) => r.plan_id !== 'free-trial' && r.status === 'active');
  if (paid.length) {
    paid.sort((a, b) => {
      const rd = paidTierRank(b.plan_id) - paidTierRank(a.plan_id);
      if (rd !== 0) return rd;
      const end = String(b.end_date).localeCompare(String(a.end_date));
      if (end !== 0) return end;
      return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
    });
    return { kind: 'paid', planId: paid[0]!.plan_id };
  }
  const trial = valid.filter((r) => r.plan_id === 'free-trial' && (r.status === 'trial' || r.status === 'active'));
  if (trial.length) {
    trial.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));
    return { kind: 'trial', planId: 'free-trial' };
  }
  return { kind: 'none' };
}

export function profilePlanAndStatusFromEntitlement(
  ent: ReturnType<typeof resolveEffectiveEntitlement>,
): { plan: AtlasProfilePlan; touchStatus: boolean; nextStatus: 'active' | null } {
  if (ent.kind === 'paid' && ent.planId) {
    return { plan: atlasPlanIdToProfilePlan(ent.planId), touchStatus: true, nextStatus: 'active' };
  }
  if (ent.kind === 'trial') {
    return { plan: 'free', touchStatus: true, nextStatus: 'active' };
  }
  return { plan: 'free', touchStatus: false, nextStatus: null };
}

/**
 * Recompute `profiles.plan` (and optionally `profiles.status`) from atlas_subscriptions.
 * Does not downgrade `suspended` accounts (compliance / abuse).
 */
export async function syncProfileEntitlementFromAtlas(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rows, error: rErr } = await admin
    .from('atlas_subscriptions')
    .select('id, plan_id, status, start_date, end_date, created_at')
    .eq('user_id', userId);

  if (rErr) {
    logAtlasServerEvent('atlas_subscriptions', 'error', 'sync_profile_read_failed', { message: rErr.message });
    return { ok: false, error: rErr.message };
  }

  const ent = resolveEffectiveEntitlement((rows ?? []) as AtlasEntitlementRow[]);
  const { plan, touchStatus, nextStatus } = profilePlanAndStatusFromEntitlement(ent);

  const { data: prof, error: pErr } = await admin.from('profiles').select('status').eq('id', userId).maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };

  const currentStatus = String((prof as { status?: string } | null)?.status ?? '').trim().toLowerCase();
  const patch: Record<string, string> = { plan, updated_at: new Date().toISOString() };
  if (touchStatus && nextStatus && currentStatus !== 'suspended') {
    patch.status = nextStatus;
  }

  const { error: uErr } = await admin.from('profiles').update(patch).eq('id', userId);
  if (uErr) {
    logAtlasServerEvent('profiles', 'error', 'sync_profile_update_failed', { message: uErr.message });
    return { ok: false, error: uErr.message };
  }
  return { ok: true };
}

/**
 * Admin PATCH on `profiles.plan`: rewrite time-bounded atlas rows, then sync profile from atlas.
 * Prevents "profile says enterprise but atlas says free" drift.
 */
export async function applyAdminProfilePlanToEntitlements(
  admin: SupabaseClient,
  userId: string,
  profilePlan: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = profilePlan.trim().toLowerCase();
  if (!isProfilePlanToken(p)) return { ok: false, error: 'invalid_plan' };

  const { data: rows, error: rErr } = await admin
    .from('atlas_subscriptions')
    .select('id, plan_id, status, start_date, end_date')
    .eq('user_id', userId);
  if (rErr) return { ok: false, error: rErr.message };

  const nowY = todayYmd();
  const effectiveIds = filterCurrentlyEffectiveRows((rows ?? []) as AtlasEntitlementRow[], nowY).map((x) => x.id).filter(Boolean) as string[];

  const stamp = new Date().toISOString();
  for (const id of effectiveIds) {
    const { error } = await admin.from('atlas_subscriptions').update({ status: 'cancelled', updated_at: stamp }).eq('id', id);
    if (error) return { ok: false, error: error.message };
  }

  if (p === 'free') {
    return syncProfileEntitlementFromAtlas(admin, userId);
  }

  const commercialId = adminProfilePlanToCommercialAtlasPlanId(p);
  if (!commercialId || !getAtlasPlanById(commercialId)) {
    return { ok: false, error: 'invalid_plan' };
  }

  const start = nowY;
  const end = addDaysYmd(start, 365);
  const { error: insErr } = await admin.from('atlas_subscriptions').insert({
    user_id: userId,
    plan_id: commercialId,
    status: 'active',
    start_date: start,
    end_date: end,
    payment_request_id: null,
    metadata: { source: 'admin_profile_plan' },
  });
  if (insErr) return { ok: false, error: insErr.message };

  return syncProfileEntitlementFromAtlas(admin, userId);
}

export async function upsertPaddleAtlasSubscription(params: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  paddleSubscriptionId: string;
  startYmd: string;
  endYmd: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, userId, planId, paddleSubscriptionId, startYmd, endYmd } = params;
  if (!getAtlasPlanById(planId)) return { ok: false, error: 'invalid_plan' };

  const { data: existing, error: findErr } = await admin
    .from('atlas_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .filter('metadata->>paddle_subscription_id', 'eq', paddleSubscriptionId)
    .maybeSingle();
  if (findErr) return { ok: false, error: findErr.message };

  const meta = { paddle_subscription_id: paddleSubscriptionId, source: 'paddle_webhook' };
  const row = {
    user_id: userId,
    plan_id: planId,
    status: 'active' as const,
    start_date: startYmd,
    end_date: endYmd,
    payment_request_id: null,
    metadata: meta,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await admin.from('atlas_subscriptions').update(row).eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from('atlas_subscriptions').insert({ ...row, created_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
  }

  return syncProfileEntitlementFromAtlas(admin, userId);
}

export async function cancelPaddleAtlasSubscription(params: {
  admin: SupabaseClient;
  paddleSubscriptionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, paddleSubscriptionId } = params;
  const { data: rows, error } = await admin
    .from('atlas_subscriptions')
    .select('id, user_id')
    .filter('metadata->>paddle_subscription_id', 'eq', paddleSubscriptionId);
  if (error) return { ok: false, error: error.message };
  const stamp = new Date().toISOString();
  for (const r of rows ?? []) {
    const uid = String((r as { user_id?: string }).user_id ?? '');
    const id = String((r as { id?: string }).id ?? '');
    if (!uid || !id) continue;
    await admin.from('atlas_subscriptions').update({ status: 'cancelled', updated_at: stamp }).eq('id', id);
    await syncProfileEntitlementFromAtlas(admin, uid);
  }
  return { ok: true };
}

/** Extract billing period from Paddle Billing payload when present. */
export function paddleSubscriptionWindowFromPayload(data: Record<string, unknown>): { startYmd: string; endYmd: string } | null {
  const cbp = data.current_billing_period as { starts_at?: string; ends_at?: string } | undefined;
  const startsAt = cbp?.starts_at;
  const endsAt = cbp?.ends_at;
  if (typeof startsAt !== 'string' || typeof endsAt !== 'string') return null;
  const s = Date.parse(startsAt);
  const e = Date.parse(endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return { startYmd: todayYmd(new Date(s)), endYmd: todayYmd(new Date(e)) };
}
