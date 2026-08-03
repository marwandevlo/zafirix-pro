import {
  isOwnerEmail,
  isPlatformAdminRole,
  jwtShowsPlatformSuperAdmin,
} from '@/app/lib/owner';

/** App `profiles.role` or JWT `app_metadata.role` — owner and admin may access administration. */
export function roleGrantsAdminAccess(role: string | null | undefined): boolean {
  return isPlatformAdminRole(role);
}

export type AdminJwtUser = {
  id?: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

/** Fast client/JWT check (no DB). Owner email and JWT admin/owner always pass. */
export function jwtUserShowsAdmin(user: AdminJwtUser | null | undefined): boolean {
  return jwtShowsPlatformSuperAdmin(user);
}
