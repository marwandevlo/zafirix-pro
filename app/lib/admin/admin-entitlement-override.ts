/**
 * Admin-granted subscription / quota overrides.
 * Writes through to profiles, atlas_subscriptions, atlas_workspace_subscriptions,
 * and zafirix_subscriptions so document AI / OCR quota checks honor the grant.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanCode, SubscriptionStatus } from '@/app/types/atlas-billing';
import { PLAN_CODES } from '@/app/types/atlas-billing';
import {
  ATLAS_PROFILE_PLANS,
  type AtlasProfilePlan,
} from '@/app/lib/admin/atlas-admin-profile-fields';
import { applyAdminProfilePlanToEntitlements } from '@/app/lib/atlas-subscription-sync';
import { getOrCreateDefaultWorkspace } from '@/app/lib/atlas-workspace-server';
import { getPlanByCode } from '@/app/lib/atlas-billing-server';
import { computeTrialStatus } from '@/app/lib/atlas-trial-manager';
import type { ZafirixPlanCode } from '@/app/types/zafirix-usage';
import { ZAFIRIX_METER_CODES } from '@/app/types/zafirix-usage';
import type { AdminEntitlementSnapshot, AdminUserBillingFields } from '@/app/lib/admin/admin-entitlement-types';
import { isAdminOverrideActive } from '@/app/lib/admin/admin-entitlement-guard';

export type { AdminEntitlementSnapshot, AdminUserBillingFields } from '@/app/lib/admin/admin-entitlement-types';
export { isAdminOverrideActive, hasAdminGrantedEntitlement } from '@/app/lib/admin/admin-entitlement-guard';

export type AdminEntitlementOverrideInput = {
  /** Coarse profiles.plan bucket. */
  plan?: AtlasProfilePlan;
  /** Workspace catalog plan (FREE / STARTER / PRO / CABINET / ENTERPRISE). */
  workspacePlanCode?: PlanCode;
  subscriptionStatus?: Extract<SubscriptionStatus, 'trial' | 'active' | 'expired' | 'cancelled'>;
  trialEndsAt?: string | null;
  /** When true: status=active, no trial/expiry, complimentary access. */
  permanent?: boolean;
  /** Add this many days to the current (or now) trial end. */
  trialExtendDays?: number;
  resetQuotas?: boolean;
  note?: string;
};

const PAID_PROFILE_PLANS = new Set(['pro', 'vip', 'enterprise']);

function isProfilePlan(v: string): v is AtlasProfilePlan {
  return (ATLAS_PROFILE_PLANS as readonly string[]).includes(v);
}

function isPlanCode(v: string): v is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(v);
}

export function profilePlanToWorkspacePlanCode(plan: string): PlanCode {
  const p = plan.trim().toLowerCase();
  if (p === 'enterprise') return 'ENTERPRISE';
  if (p === 'vip') return 'CABINET';
  if (p === 'pro') return 'PRO';
  if (p === 'starter') return 'STARTER';
  if (p === 'cabinet') return 'CABINET';
  return 'FREE';
}

export function workspacePlanCodeToProfilePlan(code: string): AtlasProfilePlan {
  const c = code.trim().toUpperCase();
  if (c === 'ENTERPRISE') return 'enterprise';
  if (c === 'CABINET') return 'vip';
  if (c === 'PRO' || c === 'STARTER') return 'pro';
  return 'free';
}

export function profilePlanToZafirixPlanCode(plan: string): ZafirixPlanCode {
  const p = plan.trim().toLowerCase();
  if (p === 'enterprise' || p === 'vip') return 'ULTIMATE';
  if (p === 'pro' || p === 'starter' || p === 'cabinet') return 'PME';
  return 'INDEPENDANT';
}

function monthStartIso(): string {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function periodYm(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function sumUsage(
  db: SupabaseClient,
  workspaceId: string,
  featureCode: string,
): Promise<number> {
  const { data } = await db
    .from('atlas_usage_events')
    .select('quantity')
    .eq('workspace_id', workspaceId)
    .eq('feature_code', featureCode)
    .gte('created_at', monthStartIso());
  return (data ?? []).reduce((s, r) => s + Number((r as { quantity?: number }).quantity ?? 0), 0);
}

export async function loadAdminEntitlementSnapshot(
  db: SupabaseClient,
  userId: string,
): Promise<AdminEntitlementSnapshot> {
  const empty: AdminEntitlementSnapshot = {
    profilePlan: 'free',
    profileStatus: 'active',
    adminOverride: false,
    workspace: {
      id: null,
      planCode: null,
      planName: null,
      status: null,
      trialEndsAt: null,
      expiresAt: null,
      adminOverride: false,
    },
    trialExpired: false,
    trialDaysRemaining: null,
    trialLabelFr: 'Hors essai',
    documents: { used: 0, limit: null, remaining: null, unlimited: true },
    ocr: { used: 0, limit: null, remaining: null, unlimited: true },
  };

  const { data: prof } = await db
    .from('profiles')
    .select('plan, status, admin_entitlement_override')
    .eq('id', userId)
    .maybeSingle();

  empty.profilePlan = String((prof as { plan?: string | null } | null)?.plan ?? 'free');
  empty.profileStatus = String((prof as { status?: string | null } | null)?.status ?? 'active');
  const profileFlag = Boolean((prof as { admin_entitlement_override?: boolean } | null)?.admin_entitlement_override);

  const { data: ws } = await db
    .from('atlas_workspaces')
    .select('id')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const workspaceId = String((ws as { id?: string } | null)?.id ?? '');
  if (!workspaceId) {
    empty.adminOverride = profileFlag;
    return empty;
  }

  const { data: sub } = await db
    .from('atlas_workspace_subscriptions')
    .select('id, plan_id, status, trial_ends_at, expires_at, admin_override, admin_override_until, metadata')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let planCode: string | null = null;
  let planName: string | null = null;
  let docsLimit: number | null = null;
  let ocrLimit: number | null = null;

  const planId = String((sub as { plan_id?: string } | null)?.plan_id ?? '');
  if (planId) {
    const { data: plan } = await db
      .from('atlas_subscription_plans')
      .select('code, name')
      .eq('id', planId)
      .maybeSingle();
    planCode = String((plan as { code?: string } | null)?.code ?? '') || null;
    planName = String((plan as { name?: string } | null)?.name ?? '') || null;

    const { data: features } = await db
      .from('atlas_plan_features')
      .select('feature_code, limit_value')
      .eq('plan_id', planId)
      .in('feature_code', ['documents_per_month', 'ocr_limit']);
    for (const f of features ?? []) {
      const code = String((f as { feature_code?: string }).feature_code ?? '');
      const lim = (f as { limit_value?: number | null }).limit_value ?? null;
      if (code === 'documents_per_month') docsLimit = lim;
      if (code === 'ocr_limit') ocrLimit = lim;
    }
  }

  const status = String((sub as { status?: string } | null)?.status ?? '') || null;
  const trialEndsAt = (sub as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null;
  const wsOverride = isAdminOverrideActive({
    adminOverride: Boolean((sub as { admin_override?: boolean } | null)?.admin_override),
    adminOverrideUntil: (sub as { admin_override_until?: string | null } | null)?.admin_override_until ?? null,
    metadata: (sub as { metadata?: unknown } | null)?.metadata,
  });
  const trial = computeTrialStatus(trialEndsAt, status);
  const skipTrial = profileFlag || wsOverride || PAID_PROFILE_PLANS.has(empty.profilePlan.toLowerCase());

  const docsUsed = await sumUsage(db, workspaceId, 'documents_per_month');
  const ocrUsed = await sumUsage(db, workspaceId, 'ocr_limit');

  return {
    profilePlan: empty.profilePlan,
    profileStatus: empty.profileStatus,
    adminOverride: skipTrial,
    workspace: {
      id: workspaceId,
      planCode,
      planName,
      status,
      trialEndsAt,
      expiresAt: (sub as { expires_at?: string | null } | null)?.expires_at ?? null,
      adminOverride: wsOverride,
    },
    trialExpired: skipTrial ? false : trial.expired,
    trialDaysRemaining: skipTrial ? null : trial.daysRemaining,
    trialLabelFr: skipTrial ? (wsOverride ? 'Accès admin' : trial.labelFr) : trial.labelFr,
    documents: {
      used: docsUsed,
      limit: docsLimit,
      remaining: docsLimit === null ? null : Math.max(0, docsLimit - docsUsed),
      unlimited: docsLimit === null,
    },
    ocr: {
      used: ocrUsed,
      limit: ocrLimit,
      remaining: ocrLimit === null ? null : Math.max(0, ocrLimit - ocrUsed),
      unlimited: ocrLimit === null,
    },
  };
}

async function resetDocumentQuotas(db: SupabaseClient, userId: string, workspaceId: string): Promise<void> {
  await db
    .from('atlas_usage_events')
    .delete()
    .eq('workspace_id', workspaceId)
    .in('feature_code', ['documents_per_month', 'ocr_limit', 'ai_requests_limit'])
    .gte('created_at', monthStartIso());

  const { data: companies } = await db.from('atlas_companies').select('id').eq('user_id', userId);
  const companyIds = (companies ?? []).map((c) => String((c as { id: string }).id)).filter(Boolean);
  if (companyIds.length === 0) return;

  await db
    .from('zafirix_usage_meters')
    .update({ used_qty: 0, updated_at: new Date().toISOString() })
    .in('company_id', companyIds)
    .eq('period_ym', periodYm())
    .in('meter_code', ZAFIRIX_METER_CODES);
}

async function upsertWorkspaceOverride(
  db: SupabaseClient,
  userId: string,
  params: {
    planCode: PlanCode;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    expiresAt: string | null;
    note: string;
    override: boolean;
  },
): Promise<string> {
  const ws = await getOrCreateDefaultWorkspace(db, userId);
  const plan = await getPlanByCode(db, params.planCode);
  if (!plan) throw new Error('workspace_plan_not_found');

  const stamp = new Date().toISOString();
  const metadata = {
    source: 'admin_plan_override',
    admin_override: params.override,
    admin_override_note: params.note || null,
    updated_at: stamp,
  };

  const { data: existing } = await db
    .from('atlas_workspace_subscriptions')
    .select('id')
    .eq('workspace_id', ws.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const baseRow = {
    workspace_id: ws.id,
    plan_id: plan.id,
    status: params.status,
    trial_ends_at: params.trialEndsAt,
    expires_at: params.expiresAt,
    cancelled_at: params.status === 'cancelled' ? stamp : null,
    metadata,
  };
  const fullRow = {
    ...baseRow,
    admin_override: params.override,
    admin_override_until: null as string | null,
    admin_override_note: params.note || null,
  };

  const write = async (payload: Record<string, unknown>) => {
    if (existing?.id) {
      return db.from('atlas_workspace_subscriptions').update(payload).eq('id', existing.id);
    }
    return db.from('atlas_workspace_subscriptions').insert({ ...payload, started_at: stamp });
  };

  let { error } = await write(fullRow);
  if (error && /admin_override|metadata/i.test(error.message)) {
    ({ error } = await write(baseRow));
  }
  if (error) throw new Error(error.message);

  return ws.id;
}

async function upsertZafirixOverrides(
  db: SupabaseClient,
  userId: string,
  params: {
    planCode: ZafirixPlanCode;
    status: 'trial' | 'active' | 'expired' | 'cancelled';
    trialEndsAt: string | null;
    note: string;
    override: boolean;
  },
): Promise<void> {
  const { data: companies } = await db.from('atlas_companies').select('id').eq('user_id', userId);
  const companyIds = (companies ?? []).map((c) => String((c as { id: string }).id)).filter(Boolean);
  if (companyIds.length === 0) return;

  const stamp = new Date().toISOString();
  const metadata = {
    source: 'admin_plan_override',
    admin_override: params.override,
    admin_override_note: params.note || null,
    updated_at: stamp,
  };

  const { data: existing } = await db
    .from('zafirix_subscriptions')
    .select('id, company_id')
    .in('company_id', companyIds);

  const byCompany = new Map<string, string>();
  for (const row of existing ?? []) {
    byCompany.set(String((row as { company_id: string }).company_id), String((row as { id: string }).id));
  }

  for (const companyId of companyIds) {
    const patch = {
      owner_user_id: userId,
      plan_code: params.planCode,
      status: params.status,
      trial_ends_at: params.trialEndsAt,
      cancelled_at: params.status === 'cancelled' ? stamp : null,
      metadata,
      updated_at: stamp,
    };
    const fullPatch = {
      ...patch,
      admin_override: params.override,
      admin_override_until: null as string | null,
      admin_override_note: params.note || null,
    };
    const existingId = byCompany.get(companyId);
    if (existingId) {
      let { error } = await db.from('zafirix_subscriptions').update(fullPatch).eq('id', existingId);
      if (error && /admin_override/i.test(error.message)) {
        ({ error } = await db.from('zafirix_subscriptions').update(patch).eq('id', existingId));
      }
      if (error) throw new Error(error.message);
    } else {
      let { error } = await db.from('zafirix_subscriptions').insert({
        ...fullPatch,
        company_id: companyId,
      });
      if (error && /admin_override/i.test(error.message)) {
        ({ error } = await db.from('zafirix_subscriptions').insert({
          ...patch,
          company_id: companyId,
        }));
      }
      if (error) throw new Error(error.message);
    }
  }
}

function resolveOverrideDates(input: AdminEntitlementOverrideInput): {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  expiresAt: string | null;
  override: boolean;
} {
  if (input.permanent) {
    return { status: 'active', trialEndsAt: null, expiresAt: null, override: true };
  }

  if (typeof input.trialExtendDays === 'number' && Number.isFinite(input.trialExtendDays)) {
    const days = Math.max(1, Math.trunc(input.trialExtendDays));
    const end = new Date();
    if (input.trialEndsAt) {
      const existing = Date.parse(input.trialEndsAt);
      if (Number.isFinite(existing) && existing > end.getTime()) {
        end.setTime(existing);
      }
    }
    end.setDate(end.getDate() + days);
    const iso = end.toISOString();
    return { status: 'trial', trialEndsAt: iso, expiresAt: iso, override: true };
  }

  if (input.trialEndsAt) {
    const iso = new Date(input.trialEndsAt).toISOString();
    const status = input.subscriptionStatus ?? 'trial';
    return { status, trialEndsAt: iso, expiresAt: status === 'trial' ? iso : null, override: true };
  }

  if (input.subscriptionStatus === 'expired' || input.subscriptionStatus === 'cancelled') {
    return {
      status: input.subscriptionStatus,
      trialEndsAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      override: false,
    };
  }

  if (input.subscriptionStatus === 'active') {
    return { status: 'active', trialEndsAt: null, expiresAt: null, override: true };
  }

  if (input.subscriptionStatus === 'trial') {
    const end = new Date();
    end.setDate(end.getDate() + 14);
    const iso = end.toISOString();
    return { status: 'trial', trialEndsAt: iso, expiresAt: iso, override: true };
  }

  return { status: 'active', trialEndsAt: null, expiresAt: null, override: true };
}

export async function applyAdminEntitlementOverride(
  db: SupabaseClient,
  userId: string,
  input: AdminEntitlementOverrideInput,
): Promise<{ ok: true; snapshot: AdminEntitlementSnapshot } | { ok: false; error: string }> {
  const { data: currentProf } = await db.from('profiles').select('plan').eq('id', userId).maybeSingle();
  const currentPlanRaw = String((currentProf as { plan?: string } | null)?.plan ?? 'free').trim().toLowerCase();
  const currentProfilePlan: AtlasProfilePlan = isProfilePlan(currentPlanRaw) ? currentPlanRaw : 'free';

  const profilePlan = input.plan ?? (input.workspacePlanCode ? workspacePlanCodeToProfilePlan(input.workspacePlanCode) : currentProfilePlan);
  if (!isProfilePlan(profilePlan)) return { ok: false, error: 'invalid_plan' };

  const workspacePlanCode = input.workspacePlanCode ?? profilePlanToWorkspacePlanCode(profilePlan);
  if (!isPlanCode(workspacePlanCode)) return { ok: false, error: 'invalid_workspace_plan' };

  const mutatingPlan =
    input.plan !== undefined ||
    input.workspacePlanCode !== undefined ||
    input.permanent === true ||
    input.subscriptionStatus !== undefined ||
    input.trialEndsAt !== undefined ||
    input.trialExtendDays !== undefined;

  if (!mutatingPlan && input.resetQuotas) {
    try {
      const ws = await getOrCreateDefaultWorkspace(db, userId);
      await resetDocumentQuotas(db, userId, ws.id);
      const snapshot = await loadAdminEntitlementSnapshot(db, userId);
      return { ok: true, snapshot };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'quota_reset_failed' };
    }
  }

  const dates = resolveOverrideDates(input);
  const note = String(input.note ?? '').trim().slice(0, 500);
  const zafirixStatus: 'trial' | 'active' | 'expired' | 'cancelled' =
    dates.status === 'suspended' ? 'cancelled' : dates.status;

  try {
    const atlasEnt = await applyAdminProfilePlanToEntitlements(db, userId, profilePlan);
    if (!atlasEnt.ok) return atlasEnt;

    const workspaceId = await upsertWorkspaceOverride(db, userId, {
      planCode: workspacePlanCode,
      status: dates.status,
      trialEndsAt: dates.trialEndsAt,
      expiresAt: dates.expiresAt,
      note,
      override: dates.override,
    });

    await upsertZafirixOverrides(db, userId, {
      planCode: profilePlanToZafirixPlanCode(profilePlan),
      status: zafirixStatus,
      trialEndsAt: dates.trialEndsAt,
      note,
      override: dates.override,
    });

    const profilePatch: Record<string, unknown> = {
      plan: profilePlan,
      updated_at: new Date().toISOString(),
    };
    if (dates.override) {
      profilePatch.admin_entitlement_override = true;
      const { data: prof } = await db.from('profiles').select('status').eq('id', userId).maybeSingle();
      const current = String((prof as { status?: string } | null)?.status ?? '').toLowerCase();
      if (current !== 'suspended' && current !== 'banned' && current !== 'pending') {
        profilePatch.status = 'active';
      }
    } else {
      profilePatch.admin_entitlement_override = false;
    }

    let { error: pErr } = await db.from('profiles').update(profilePatch).eq('id', userId);
    if (pErr && /admin_entitlement_override/i.test(pErr.message)) {
      const { admin_entitlement_override: _ignored, ...withoutFlag } = profilePatch;
      ({ error: pErr } = await db.from('profiles').update(withoutFlag).eq('id', userId));
    }
    if (pErr) return { ok: false, error: pErr.message };

    if (input.resetQuotas) {
      await resetDocumentQuotas(db, userId, workspaceId);
    }

    const snapshot = await loadAdminEntitlementSnapshot(db, userId);
    return { ok: true, snapshot };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'override_failed' };
  }
}

export async function enrichAdminUsersWithBilling<T extends { id: string; plan?: string }>(
  db: SupabaseClient,
  users: T[],
): Promise<Array<T & AdminUserBillingFields>> {
  const empty = (u: T): T & AdminUserBillingFields => ({
    ...u,
    subscription_status: null,
    subscription_plan: null,
    trial_ends_at: null,
    trial_expired: false,
    trial_label: '—',
    admin_override: false,
    documents_used: 0,
    documents_limit: null,
  });

  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);

  const { data: workspaces, error: wsErr } = await db
    .from('atlas_workspaces')
    .select('id, owner_user_id')
    .in('owner_user_id', ids)
    .limit(2000);
  if (wsErr) return users.map(empty);

  const wsByUser = new Map<string, string[]>();
  const wsIds: string[] = [];
  for (const w of workspaces ?? []) {
    const uid = String((w as { owner_user_id: string }).owner_user_id);
    const id = String((w as { id: string }).id);
    wsIds.push(id);
    const list = wsByUser.get(uid) ?? [];
    list.push(id);
    wsByUser.set(uid, list);
  }

  const { data: subs } = wsIds.length
    ? await db
        .from('atlas_workspace_subscriptions')
        .select('workspace_id, plan_id, status, trial_ends_at, admin_override, admin_override_until, metadata, created_at')
        .in('workspace_id', wsIds)
        .order('created_at', { ascending: false })
        .limit(4000)
    : { data: [] as unknown[] };

  const subByWs = new Map<string, Record<string, unknown>>();
  for (const row of subs ?? []) {
    const wsId = String((row as { workspace_id: string }).workspace_id);
    if (!subByWs.has(wsId)) subByWs.set(wsId, row as Record<string, unknown>);
  }

  const planIds = Array.from(
    new Set(
      Array.from(subByWs.values())
        .map((s) => String(s.plan_id ?? ''))
        .filter(Boolean),
    ),
  );
  const { data: plans } = planIds.length
    ? await db.from('atlas_subscription_plans').select('id, code').in('id', planIds)
    : { data: [] as Array<{ id: string; code: string }> };
  const planCodeById = new Map<string, string>();
  for (const p of plans ?? []) {
    planCodeById.set(String((p as { id: string }).id), String((p as { code: string }).code));
  }

  const { data: features } = planIds.length
    ? await db
        .from('atlas_plan_features')
        .select('plan_id, feature_code, limit_value')
        .in('plan_id', planIds)
        .eq('feature_code', 'documents_per_month')
    : { data: [] as unknown[] };
  const docsLimitByPlan = new Map<string, number | null>();
  for (const f of features ?? []) {
    docsLimitByPlan.set(
      String((f as { plan_id: string }).plan_id),
      (f as { limit_value?: number | null }).limit_value ?? null,
    );
  }

  const usedByWs = new Map<string, number>();
  if (wsIds.length > 0) {
    const { data: events } = await db
      .from('atlas_usage_events')
      .select('workspace_id, quantity')
      .in('workspace_id', wsIds)
      .eq('feature_code', 'documents_per_month')
      .gte('created_at', monthStartIso())
      .limit(20000);
    for (const ev of events ?? []) {
      const wsId = String((ev as { workspace_id: string }).workspace_id);
      usedByWs.set(wsId, (usedByWs.get(wsId) ?? 0) + Number((ev as { quantity?: number }).quantity ?? 0));
    }
  }

  const { data: profiles } = await db
    .from('profiles')
    .select('id, admin_entitlement_override, plan, status')
    .in('id', ids);

  const flagById = new Map<string, boolean>();
  for (const p of profiles ?? []) {
    flagById.set(String((p as { id: string }).id), Boolean((p as { admin_entitlement_override?: boolean }).admin_entitlement_override));
  }

  return users.map((u) => {
    const owned = wsByUser.get(u.id) ?? [];
    let sub: Record<string, unknown> | null = null;
    for (const wsId of owned) {
      const candidate = subByWs.get(wsId);
      if (candidate) {
        sub = candidate;
        break;
      }
    }
    const status = String(sub?.status ?? '') || null;
    const trialEndsAt = (sub?.trial_ends_at as string | null | undefined) ?? null;
    const planId = String(sub?.plan_id ?? '');
    const planCode = planCodeById.get(planId) ?? null;
    const wsOverride = isAdminOverrideActive({
      adminOverride: Boolean(sub?.admin_override),
      adminOverrideUntil: (sub?.admin_override_until as string | null | undefined) ?? null,
      metadata: sub?.metadata,
    });
    const profileFlag = flagById.get(u.id) === true;
    const paid = PAID_PROFILE_PLANS.has(String(u.plan ?? '').toLowerCase());
    const skipTrial = profileFlag || wsOverride || paid;
    const trial = computeTrialStatus(trialEndsAt, status);
    const usedWs = owned.reduce((n, id) => n + (usedByWs.get(id) ?? 0), 0);

    return {
      ...u,
      subscription_status: status,
      subscription_plan: planCode,
      trial_ends_at: trialEndsAt,
      trial_expired: skipTrial ? false : trial.expired,
      trial_label: skipTrial ? (wsOverride || profileFlag ? 'Accès admin' : trial.labelFr) : trial.labelFr,
      admin_override: wsOverride || profileFlag,
      documents_used: usedWs,
      documents_limit: docsLimitByPlan.get(planId) ?? null,
    };
  });
}
