import type { SupabaseClient } from '@supabase/supabase-js';
import {
  filterCurrentlyEffectiveRows,
  type AtlasEntitlementRow,
} from '@/app/lib/atlas-subscription-sync';

const PAID_PROFILE_PLANS = new Set(['pro', 'vip', 'enterprise']);
const BLOCKED_ACCOUNT_STATUSES = new Set(['suspended', 'banned']);

function isOverrideStillValid(override: boolean, until: string | null | undefined): boolean {
  if (!override) return false;
  if (!until) return true;
  const t = Date.parse(until);
  if (!Number.isFinite(t)) return true;
  return t > Date.now();
}

export function isAdminOverrideActive(params: {
  adminOverride?: boolean | null;
  adminOverrideUntil?: string | null;
  metadata?: unknown;
  status?: string | null;
}): boolean {
  if (String(params.status ?? '').trim().toLowerCase() === 'active') return true;
  const meta =
    params.metadata && typeof params.metadata === 'object'
      ? (params.metadata as Record<string, unknown>)
      : {};
  const fromMeta =
    meta.admin_override === true ||
    meta.admin_override === 'true' ||
    meta.permanent === true ||
    meta.permanent_access === true ||
    String(meta.source ?? '') === 'admin_plan_override' ||
    String(meta.source ?? '') === 'admin_profile_plan';
  const untilFromMeta = typeof meta.admin_override_until === 'string' ? meta.admin_override_until : null;
  return isOverrideStillValid(
    Boolean(params.adminOverride) || fromMeta,
    params.adminOverrideUntil ?? untilFromMeta,
  );
}

function isMissingColumnError(message: string | undefined): boolean {
  const m = String(message ?? '').toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('schema cache') ||
    m.includes('could not find') ||
    m.includes('column')
  );
}

type GrantRow = {
  status?: string | null;
  admin_override?: boolean | null;
  admin_override_until?: string | null;
  metadata?: unknown;
};

function rowGrantsAccess(row: GrantRow): boolean {
  return isAdminOverrideActive({
    adminOverride: Boolean(row.admin_override),
    adminOverrideUntil: row.admin_override_until ?? null,
    metadata: row.metadata,
    status: row.status,
  });
}

async function loadRows(
  primary: PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>,
  fallback: PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>,
): Promise<GrantRow[]> {
  const first = await primary;
  if (!first.error) return (first.data ?? []) as GrantRow[];
  if (!isMissingColumnError(first.error.message)) return [];
  const second = await fallback;
  return (second.data ?? []) as GrantRow[];
}

/**
 * True when admin-granted (or paid / active) access should skip "essai expiré" blocks.
 * Does not skip numeric quota limits unless the assigned plan is unlimited.
 *
 * Reads core columns first so a missing migration (`admin_override`, etc.) cannot
 * hide an already-persisted paid plan or `status = active` grant.
 */
export async function hasAdminGrantedEntitlement(
  db: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;

  const withFlag = await db
    .from('profiles')
    .select('plan, status, admin_entitlement_override')
    .eq('id', userId)
    .maybeSingle();
  const prof = withFlag.error && isMissingColumnError(withFlag.error.message)
    ? (await db.from('profiles').select('plan, status').eq('id', userId).maybeSingle()).data
    : withFlag.data;

  const plan = String((prof as { plan?: string | null } | null)?.plan ?? '').trim().toLowerCase();
  const status = String((prof as { status?: string | null } | null)?.status ?? '').trim().toLowerCase();
  if (BLOCKED_ACCOUNT_STATUSES.has(status)) return false;

  if (Boolean((prof as { admin_entitlement_override?: boolean } | null)?.admin_entitlement_override)) return true;
  if (PAID_PROFILE_PLANS.has(plan)) return true;

  const { data: atlasRows } = await db
    .from('atlas_subscriptions')
    .select('plan_id, status, start_date, end_date, metadata')
    .eq('user_id', userId)
    .limit(50);

  for (const row of atlasRows ?? []) {
    const st = String((row as GrantRow).status ?? '').toLowerCase();
    if (st === 'cancelled') continue;
    if (
      isAdminOverrideActive({
        metadata: (row as GrantRow).metadata,
        status: st === 'active' ? 'active' : undefined,
      })
    ) {
      return true;
    }
  }
  const effective = filterCurrentlyEffectiveRows((atlasRows ?? []) as AtlasEntitlementRow[]);
  if (effective.some((r) => r.plan_id !== 'free-trial' && r.status === 'active')) return true;

  const { data: workspaces } = await db
    .from('atlas_workspaces')
    .select('id')
    .eq('owner_user_id', userId)
    .limit(20);
  const wsIds = (workspaces ?? []).map((w) => String((w as { id: string }).id)).filter(Boolean);
  if (wsIds.length > 0) {
    const wsRows = await loadRows(
      db
        .from('atlas_workspace_subscriptions')
        .select('status, admin_override, admin_override_until, metadata')
        .in('workspace_id', wsIds)
        .in('status', ['trial', 'active'])
        .limit(20),
      db
        .from('atlas_workspace_subscriptions')
        .select('status, metadata')
        .in('workspace_id', wsIds)
        .in('status', ['trial', 'active'])
        .limit(20),
    );
    if (wsRows.some(rowGrantsAccess)) return true;
  }

  const zRows = await loadRows(
    db
      .from('zafirix_subscriptions')
      .select('status, admin_override, admin_override_until, metadata')
      .eq('owner_user_id', userId)
      .in('status', ['trial', 'active'])
      .limit(20),
    db
      .from('zafirix_subscriptions')
      .select('status, metadata')
      .eq('owner_user_id', userId)
      .in('status', ['trial', 'active'])
      .limit(20),
  );
  if (zRows.some(rowGrantsAccess)) return true;

  return false;
}

export const shouldSkipExpiredTrial = hasAdminGrantedEntitlement;

export function isExpiredTrialMessage(code?: string | null, messageFr?: string | null): boolean {
  if (String(code ?? '').toLowerCase() === 'trial_expired') return true;
  return /essai a expiré|essai a expire|trial expired/i.test(String(messageFr ?? ''));
}
