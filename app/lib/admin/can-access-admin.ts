import { isOwnerEmail } from '@/app/lib/owner';

/** App `profiles.role` or JWT `app_metadata.role` — owner and admin may access administration. */
export function roleGrantsAdminAccess(role: string | null | undefined): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'owner';
}

export type AdminJwtUser = {
  id?: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

/** Fast client/JWT check (no DB). Owner email always passes. */
export function jwtUserShowsAdmin(user: AdminJwtUser | null | undefined): boolean {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  return roleGrantsAdminAccess(String(user.app_metadata?.role ?? ''));
}
