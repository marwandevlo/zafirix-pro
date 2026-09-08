import type { SupabaseClient } from '@supabase/supabase-js';

const PAID_PROFILE_PLANS = new Set(['pro', 'vip', 'enterprise']);

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
}): boolean {
  const meta =
    params.metadata && typeof params.metadata === 'object'
      ? (params.metadata as Record<string, unknown>)
      : {};
  const fromMeta = meta.admin_override === true || meta.admin_override === 'true';
  const untilFromMeta = typeof meta.admin_override_until === 'string' ? meta.admin_override_until : null;
  return isOverrideStillValid(
    Boolean(params.adminOverride) || fromMeta,
    params.adminOverrideUntil ?? untilFromMeta,
  );
}

/**
 * True when admin-granted (or paid) access should skip "essai expiré" blocks.
 * Does not skip numeric quota limits unless the assigned plan is unlimited.
 */
export async function hasAdminGrantedEntitlement(
  db: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;

  const { data: prof } = await db
    .from('profiles')
    .select('plan, status, admin_entitlement_override')
    .eq('id', userId)
    .maybeSingle();

  const plan = String((prof as { plan?: string | null } | null)?.plan ?? '').trim().toLowerCase();
  const status = String((prof as { status?: string | null } | null)?.status ?? '').trim().toLowerCase();
  const flagged = Boolean((prof as { admin_entitlement_override?: boolean } | null)?.admin_entitlement_override);
  if (flagged && !['suspended', 'banned'].includes(status)) return true;
  if (PAID_PROFILE_PLANS.has(plan) && !['suspended', 'banned'].includes(status)) return true;

  const { data: workspaces } = await db
    .from('atlas_workspaces')
    .select('id')
    .eq('owner_user_id', userId)
    .limit(20);
  const wsIds = (workspaces ?? []).map((w) => String((w as { id: string }).id)).filter(Boolean);
  if (wsIds.length > 0) {
    const { data: subs } = await db
      .from('atlas_workspace_subscriptions')
      .select('status, admin_override, admin_override_until, metadata')
      .in('workspace_id', wsIds)
      .in('status', ['trial', 'active'])
      .limit(20);
    for (const row of subs ?? []) {
      if (
        isAdminOverrideActive({
          adminOverride: Boolean((row as { admin_override?: boolean }).admin_override),
          adminOverrideUntil: (row as { admin_override_until?: string | null }).admin_override_until ?? null,
          metadata: (row as { metadata?: unknown }).metadata,
        })
      ) {
        return true;
      }
    }
  }

  const { data: zSubs } = await db
    .from('zafirix_subscriptions')
    .select('status, admin_override, admin_override_until, metadata')
    .eq('owner_user_id', userId)
    .in('status', ['trial', 'active'])
    .limit(20);
  for (const row of zSubs ?? []) {
    if (
      isAdminOverrideActive({
        adminOverride: Boolean((row as { admin_override?: boolean }).admin_override),
        adminOverrideUntil: (row as { admin_override_until?: string | null }).admin_override_until ?? null,
        metadata: (row as { metadata?: unknown }).metadata,
      })
    ) {
      return true;
    }
  }

  return false;
}
