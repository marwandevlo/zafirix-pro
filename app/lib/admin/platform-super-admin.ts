/**
 * Elevate / sync platform owner profile + JWT on login.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  isOwnerEmail,
  isPlatformAdminRole,
  isPlatformSuperAdminProfile,
  OWNER_PROFILE_DEFAULTS,
} from '@/app/lib/owner';

export type OwnerElevationPatch = {
  role?: string;
  plan?: string;
  status?: string;
  email?: string | null;
};

/** Force owner account to owner / enterprise / active when drifted. */
export async function elevateOwnerProfileIfNeeded(
  admin: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<OwnerElevationPatch | null> {
  if (!isOwnerEmail(email)) return null;

  const { data: row, error } = await admin
    .from('profiles')
    .select('role, plan, status, email')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[platform-super-admin] owner profile read failed', error.message);
    return null;
  }

  const current = (row ?? {}) as { role?: string; plan?: string; status?: string; email?: string | null };
  const patch: OwnerElevationPatch = {};

  if (String(current.role ?? '').toLowerCase() !== OWNER_PROFILE_DEFAULTS.role) {
    patch.role = OWNER_PROFILE_DEFAULTS.role;
  }
  if (String(current.plan ?? '').toLowerCase() !== OWNER_PROFILE_DEFAULTS.plan) {
    patch.plan = OWNER_PROFILE_DEFAULTS.plan;
  }
  if (String(current.status ?? '').toLowerCase() !== OWNER_PROFILE_DEFAULTS.status) {
    patch.status = OWNER_PROFILE_DEFAULTS.status;
  }
  const normalizedEmail = String(email ?? '').trim();
  if (normalizedEmail && !String(current.email ?? '').trim()) {
    patch.email = normalizedEmail;
  }

  if (Object.keys(patch).length === 0) return null;

  const { error: upErr } = await admin.from('profiles').update(patch).eq('id', userId);
  if (upErr) {
    console.warn('[platform-super-admin] owner elevation failed', upErr.message);
    return null;
  }

  console.info('[platform-super-admin] owner profile elevated', { userId, patch });
  return patch;
}

/** Sync JWT app_metadata.role for owner / platform admin (middleware fast-path). */
export async function syncPlatformAdminJwtMetadata(
  admin: SupabaseClient,
  user: User,
): Promise<void> {
  const email = user.email ?? null;
  let targetRole: string | null = null;

  if (isOwnerEmail(email)) {
    targetRole = 'owner';
  } else {
    const { data: prof } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const profileRole = String((prof as { role?: string | null } | null)?.role ?? '').toLowerCase();
    if (isPlatformAdminRole(profileRole)) {
      targetRole = profileRole === 'owner' ? 'owner' : 'admin';
    }
  }

  if (!targetRole) return;

  const current = String(user.app_metadata?.role ?? '').trim().toLowerCase();
  if (current === targetRole) return;

  const appMeta = { ...(user.app_metadata ?? {}), role: targetRole };
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: appMeta });
  if (error) {
    console.warn('[platform-super-admin] JWT metadata sync failed', error.message);
    return;
  }
  console.info('[platform-super-admin] JWT app_metadata.role synced', { userId: user.id, role: targetRole });
}

export async function ensurePlatformSuperAdminSession(
  admin: SupabaseClient,
  user: User,
): Promise<void> {
  await elevateOwnerProfileIfNeeded(admin, user.id, user.email);
  await syncPlatformAdminJwtMetadata(admin, user);
}

export function profileRowIsSuperAdmin(row: {
  role?: string | null;
  email?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  return isPlatformSuperAdminProfile(row.role, row.email);
}
