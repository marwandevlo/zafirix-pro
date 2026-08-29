/** Pure status helpers — safe for Edge middleware (no Resend / Node APIs). */

export const RECENT_PROFILE_MS = 15 * 60 * 1000;

export function isAccountAcceptedStatus(status: string | null | undefined): boolean {
  const value = String(status ?? '').trim().toLowerCase();
  return value === 'active' || value === 'accepted' || value === 'approved';
}

export function isRecentlyCreatedProfile(createdAt: string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) && now - parsed < RECENT_PROFILE_MS;
}
