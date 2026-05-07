import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseServiceRoleClient, getSupabaseUserClientFromBearer } from '@/app/lib/supabase-admin';
import { jwtUserShowsAdmin, roleGrantsAdminAccess } from '@/app/lib/admin/can-access-admin';

export function requireBearer(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim() || null;
}

async function getAuthUserFromRequest(request: NextRequest): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<ReturnType<typeof getSupabaseUserClientFromBearer>['auth']['getUser']>>['data']['user']>; source: 'bearer' | 'cookie' }
  | { ok: false; response: NextResponse }
> {
  // 1) Bearer token (used by existing admin clients)
  const token = requireBearer(request);
  if (token) {
    const userClient = getSupabaseUserClientFromBearer(token);
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) {
      return { ok: false, response: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };
    }
    return { ok: true, user: auth.user, source: 'bearer' };
  }

  // 2) Cookie session (App Router route handlers on Vercel)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  });
  const { data: auth } = await cookieClient.auth.getUser();
  if (!auth.user) {
    const payload =
      process.env.NODE_ENV === 'development'
        ? { error: 'auth_required', debug: { source: 'cookie', hasCookies: request.cookies.getAll().length > 0 } }
        : { error: 'auth_required' };
    return { ok: false, response: NextResponse.json(payload, { status: 401 }) };
  }
  return { ok: true, user: auth.user, source: 'cookie' };
}

export async function requireAdmin(request: NextRequest): Promise<
  | { ok: true; adminUserId: string; adminEmail: string }
  | { ok: false; response: NextResponse }
> {
  const auth = await getAuthUserFromRequest(request);
  if (!auth.ok) return auth;

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

