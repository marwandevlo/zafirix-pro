import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { getUserActivityHistory, isUserActiveNow, presenceStatus } from '@/app/lib/atlas-user-activity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (atlasDataBackend() !== 'supabase') {
      return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
    }

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { userId } = await context.params;
    if (!userId) {
      return NextResponse.json({ error: 'missing_user_id' }, { status: 400 });
    }

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(limitRaw) ? Math.min(limitRaw, 200) : 50;

    const admin = getSupabaseServiceRoleClient();
    const [{ data: profile }, activities] = await Promise.all([
      admin
        .from('profiles')
        .select('id, email, full_name, last_seen_at, last_login, role, status')
        .eq('id', userId)
        .maybeSingle(),
      getUserActivityHistory(userId, limit),
    ]);

    if (!profile) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const lastSeenAt = (profile as { last_seen_at?: string | null }).last_seen_at ?? null;

    return NextResponse.json({
      user: {
        id: String(profile.id),
        email: String((profile as { email?: string | null }).email ?? ''),
        fullName: String((profile as { full_name?: string | null }).full_name ?? ''),
        role: String((profile as { role?: string | null }).role ?? 'user'),
        status: String((profile as { status?: string | null }).status ?? 'active'),
        lastSeenAt,
        lastLoginAt: (profile as { last_login?: string | null }).last_login ?? null,
        presence: presenceStatus(lastSeenAt),
        isActiveNow: isUserActiveNow(lastSeenAt),
      },
      activities,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}
