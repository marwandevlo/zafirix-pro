/**
 * Central admin privilege checks for middleware and /api/admin/* routes.
 * Do not import server-only modules here.
 */

import { normalizeProfileRole } from '@/app/lib/atlas-profile-guards';
import {
  getOwnerEmail,
  isOwnerEmail,
  isPlatformAdminRole,
  jwtShowsPlatformSuperAdmin,
} from '@/app/lib/owner';

/** @deprecated Use getOwnerEmail() from @/app/lib/owner */
export const ATLAS_OWNER_EMAIL_LOWER = getOwnerEmail();

/** Supabase Auth user JWT claim — admin or owner role in app_metadata. */
export function isJwtAppMetadataAdmin(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return jwtShowsPlatformSuperAdmin(user as { app_metadata?: Record<string, unknown>; email?: string | null });
}

export function isAtlasOwnerEmail(email: string | undefined | null): boolean {
  return isOwnerEmail(email);
}

export function isPrivilegedProfileRole(role: string | undefined | null): boolean {
  return isPlatformAdminRole(normalizeProfileRole(role));
}

type MinimalUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
};

/** True if the signed-in user may access admin UI and admin APIs. */
export async function isAtlasAdminUser(
  supabase: { from: (table: string) => unknown },
  user: MinimalUser | null | undefined,
): Promise<boolean> {
  if (!user?.id) return false;
  if (isJwtAppMetadataAdmin(user)) return true;
  if (isAtlasOwnerEmail(user.email)) return true;
  const chain = (supabase as any).from('profiles').select('role').eq('id', user.id).maybeSingle();
  const { data, error } = (await chain) as { data: unknown; error: { message: string } | null };
  if (error) return false;
  const row = data as { role?: string | null } | null;
  return isPrivilegedProfileRole(row?.role);
}
