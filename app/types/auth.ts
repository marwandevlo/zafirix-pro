/**
 * Canonical auth / profile-status types and normalization.
 * Single source of truth for middleware, API routes, and client routing.
 */

/** Matches `profiles_status_check` (migration 20260611000000). */
export const PROFILE_STATUSES = ['pending', 'active', 'suspended', 'banned'] as const;

export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/**
 * Normalize any raw DB / legacy value into a canonical ProfileStatus.
 * - `approved` (legacy) → `active`
 * - unknown / empty → `pending` (safe default for authorization checks only;
 *   client routing must NOT treat null as pending — see resolvePostAuthRoute)
 */
export function normalizeStatus(raw: string | null | undefined): ProfileStatus {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'approved') return 'active';
  if ((PROFILE_STATUSES as readonly string[]).includes(value)) {
    return value as ProfileStatus;
  }
  return 'pending';
}

export function isPendingStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === 'pending';
}

export function isActiveStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === 'active';
}

export function isSuspendedStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === 'suspended';
}

export function isBannedStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === 'banned';
}

export function isBlockedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'suspended' || normalized === 'banned';
}

export function isKnownStatus(raw: string | null | undefined): raw is ProfileStatus {
  if (raw == null || String(raw).trim() === '') return false;
  const normalized = normalizeStatus(raw);
  return (PROFILE_STATUSES as readonly string[]).includes(normalized);
}

export type PostAuthRoute = '/' | '/pending-approval' | '/access-denied';

export type ProfileStatusFetchSource = 'api' | 'rls' | 'none';

export type ProfileStatusFetchResult = {
  status: ProfileStatus | null;
  source: ProfileStatusFetchSource;
  error: string | null;
};

export type AuthoritativeStatusReadSource = 'service_role' | 'session' | 'none';

export type AuthoritativeStatusReadResult = {
  raw: string | null;
  normalized: ProfileStatus | null;
  source: AuthoritativeStatusReadSource;
  error: string | null;
};
