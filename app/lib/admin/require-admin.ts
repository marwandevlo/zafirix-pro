import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient, getSupabaseUserClientFromBearer } from '@/app/lib/supabase-admin';
import { jwtUserShowsAdmin, roleGrantsAdminAccess } from '@/app/lib/admin/can-access-admin';

export function requireBearer(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim() || null;
}

export async function requireAdmin(request: NextRequest): Promise<
  | { ok: true; adminUserId: string; adminEmail: string }
  | { ok: false; response: NextResponse }
> {
  const token = requireBearer(request);
  if (!token) return { ok: false, response: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };

  const userClient = getSupabaseUserClientFromBearer(token);
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return { ok: false, response: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };

  if (jwtUserShowsAdmin(auth.user)) {
    return { ok: true, adminUserId: auth.user.id, adminEmail: auth.user.email ?? '' };
  }

  // Fallback: profiles.role (service role only).
  try {
    const admin = getSupabaseServiceRoleClient();
    const { data: prof, error } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (error) return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
    const r = String((prof as { role?: string | null } | null)?.role ?? '');
    if (!roleGrantsAdminAccess(r)) {
      return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
    }
    return { ok: true, adminUserId: auth.user.id, adminEmail: auth.user.email ?? '' };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
}

export async function writeAdminLog(params: {
  adminId: string;
  targetUserId?: string | null;
  action: string;
  details?: unknown;
}) {
  const admin = getSupabaseServiceRoleClient();
  await admin.from('admin_logs').insert({
    admin_id: params.adminId,
    target_user_id: params.targetUserId ?? null,
    action: params.action,
    details: params.details ?? {},
  });
}

