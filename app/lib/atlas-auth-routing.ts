/**
 * Post-auth client routing from profiles.status.
 *
 * Never treat null/unknown status as pending on the client.
 * Route to `/` and let middleware enforce gates using authoritative DB reads.
 */

import {
  isActiveStatus,
  isBlockedStatus,
  isKnownStatus,
  isPendingStatus,
  normalizeStatus,
  type PostAuthRoute,
  type ProfileStatus,
} from '@/app/types/auth';

export type AtlasPostAuthRoute = PostAuthRoute;

const BLOCKED_NEXT_PATHS = new Set<PostAuthRoute>(['/pending-approval', '/access-denied']);

function sanitizeNextPath(nextPath?: string | null): string | null {
  const next = String(nextPath ?? '').trim();
  if (!next.startsWith('/')) return null;
  if (BLOCKED_NEXT_PATHS.has(next as PostAuthRoute)) return null;
  return next;
}

/**
 * Resolve immediate post-login destination.
 * @param profileStatus Raw or normalized status; null/unknown always routes home.
 */
export function resolvePostAuthRoute(
  profileStatus: string | null | undefined,
  nextPath?: string | null,
): PostAuthRoute | string {
  const safeNext = sanitizeNextPath(nextPath);

  if (profileStatus == null || String(profileStatus).trim() === '') {
    return safeNext ?? '/';
  }

  if (!isKnownStatus(profileStatus)) {
    return safeNext ?? '/';
  }

  const normalized: ProfileStatus = normalizeStatus(profileStatus);

  if (isPendingStatus(normalized)) return '/pending-approval';
  if (isBlockedStatus(normalized)) return '/access-denied';
  if (isActiveStatus(normalized)) return safeNext ?? '/';

  return safeNext ?? '/';
}

export function isKnownProfileStatus(value: string | null | undefined): value is ProfileStatus {
  return isKnownStatus(value);
}
