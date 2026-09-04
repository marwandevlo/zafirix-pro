import 'server-only';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { jwtUserShowsAdmin, roleGrantsAdminAccess } from '@/app/lib/admin/can-access-admin';
import { getServerUser } from '@/app/lib/supabase-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export type AdminSessionGuard =
  | { ok: true; adminUserId: string; adminEmail: string }
  | { ok: false; error: string; status: 400 | 401 | 403 };

/** Cookie-session admin guard for Server Actions (no NextRequest). */
export async function requireAdminSession(): Promise<AdminSessionGuard> {
  if (atlasDataBackend() !== 'supabase') {
    return { ok: false, error: 'not_enabled', status: 400 };
  }

  const user = await getServerUser();
  if (!user) {
    return { ok: false, error: 'auth_required', status: 401 };
  }

  if (jwtUserShowsAdmin(user)) {
    return { ok: true, adminUserId: user.id, adminEmail: user.email ?? '' };
  }

  try {
    const admin = getSupabaseServiceRoleClient();
    const { data: prof, error } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (error) return { ok: false, error: 'forbidden', status: 403 };
    const role = String((prof as { role?: string | null } | null)?.role ?? '');
    if (!roleGrantsAdminAccess(role)) {
      return { ok: false, error: 'forbidden', status: 403 };
    }
    return { ok: true, adminUserId: user.id, adminEmail: user.email ?? '' };
  } catch {
    return { ok: false, error: 'forbidden', status: 403 };
  }
}
