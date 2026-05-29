/**
 * Central admin privilege checks for middleware and /api/admin/* routes.
 * Do not import server-only modules here.
 */

export const ATLAS_OWNER_EMAIL_LOWER = 'maizimarouane1991@gmail.com';

function emailLower(s: string | undefined | null): string {
  return String(s ?? '').trim().toLowerCase();
}

/** Supabase Auth user JWT claim (rare unless explicitly set on the user). */
export function isJwtAppMetadataAdmin(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return (user?.app_metadata as { role?: string } | undefined)?.role === 'admin';
}

export function isAtlasOwnerEmail(email: string | undefined | null): boolean {
  return emailLower(email) === ATLAS_OWNER_EMAIL_LOWER;
}

import { normalizeProfileRole } from '@/app/lib/atlas-profile-guards';

export function isPrivilegedProfileRole(role: string | undefined | null): boolean {
  const r = normalizeProfileRole(role);
  return r === 'owner' || r === 'admin';
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
