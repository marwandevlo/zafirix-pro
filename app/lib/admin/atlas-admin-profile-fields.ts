/** Values aligned with DB check constraints / admin UI (see `profiles.plan`, `profiles.role`). */

export const ATLAS_PROFILE_PLANS = ['free', 'pro', 'vip', 'enterprise'] as const;
export type AtlasProfilePlan = (typeof ATLAS_PROFILE_PLANS)[number];

export const ATLAS_PROFILE_ROLES = ['user', 'moderator', 'admin', 'owner'] as const;
export type AtlasProfileRole = (typeof ATLAS_PROFILE_ROLES)[number];

/** Canonical stored set — aliases `approved`/`rejected` map via normalizeStatus. */
export const ATLAS_PROFILE_STATUSES = ['pending', 'active', 'suspended', 'banned'] as const;
export type AtlasProfileStatus = (typeof ATLAS_PROFILE_STATUSES)[number];

export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

/** Safe snake-case tokens for role/status beyond fixed enums (admin-only PATCH). */
export function isSafeProfileToken(s: string): boolean {
  const t = s.trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,30}$/.test(t);
}
