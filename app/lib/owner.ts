/**
 * Platform owner / super-admin identity (single source of truth).
 * Configure via ATLAS_OWNER_EMAIL or NEXT_PUBLIC_ATLAS_OWNER_EMAIL.
 */

const DEFAULT_OWNER_EMAIL = 'maizimarouane1991@gmail.com';

/** Canonical owner email (lowercase). */
export function getOwnerEmail(): string {
  const raw =
    process.env.ATLAS_OWNER_EMAIL ??
    process.env.NEXT_PUBLIC_ATLAS_OWNER_EMAIL ??
    DEFAULT_OWNER_EMAIL;
  return String(raw).trim().toLowerCase();
}

/** @deprecated Use getOwnerEmail() — kept for existing imports. */
export const OWNER_EMAIL = getOwnerEmail();

export function isOwnerEmail(email: string | null | undefined): boolean {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === getOwnerEmail();
}

/** profiles.role values that grant platform super-admin (admin panel + billing bypass). */
export function isPlatformAdminRole(role: string | null | undefined): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return r === 'owner' || r === 'admin';
}

/** Owner email or privileged platform role. */
export function isPlatformSuperAdminProfile(
  role: string | null | undefined,
  email?: string | null | undefined,
): boolean {
  if (isOwnerEmail(email)) return true;
  return isPlatformAdminRole(role);
}

export type PlatformSuperAdminUserLike = {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

/** JWT app_metadata.role or owner email. */
export function jwtShowsPlatformSuperAdmin(user: PlatformSuperAdminUserLike | null | undefined): boolean {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  const jwtRole = String(user.app_metadata?.role ?? '').trim().toLowerCase();
  return jwtRole === 'owner' || jwtRole === 'admin';
}

/** Client-side flag set by EmailLifecycleBootstrap for quota/plan bypass. */
export const OWNER_SESSION_KEY = 'atlas_owner';

export function isOwnerSessionFlagSet(): boolean {
  if (typeof window === 'undefined') return false;
  return (sessionStorage.getItem(OWNER_SESSION_KEY) ?? '') === '1';
}

export function markOwnerSessionFlag(isOwner: boolean): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(OWNER_SESSION_KEY, isOwner ? '1' : '0');
}

/** Privileged columns every owner login should retain. */
export const OWNER_PROFILE_DEFAULTS = {
  role: 'owner',
  plan: 'enterprise',
  status: 'active',
} as const;
