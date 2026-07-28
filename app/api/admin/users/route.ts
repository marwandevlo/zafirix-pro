import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireAdmin } from '@/app/lib/admin/require-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  plan: string | null;
  status: string | null;
  created_at: string | null;
  last_login: string | null;
};

function appMetaRole(user: User): string {
  const meta = user.app_metadata as Record<string, unknown> | undefined;
  return String(meta?.role ?? '');
}

export async function GET(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
    try {
      admin = getSupabaseServiceRoleClient();
    } catch {
      return NextResponse.json(
        { users: [], warning: 'SUPABASE_SERVICE_ROLE_KEY not set; users list requires Supabase Admin API.' },
        { status: 200 },
      );
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const role = (url.searchParams.get('role') ?? '').trim().toLowerCase();
    const plan = (url.searchParams.get('plan') ?? '').trim().toLowerCase();
    const status = (url.searchParams.get('status') ?? '').trim().toLowerCase();

    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return NextResponse.json({ error: 'admin_api_error' }, { status: 500 });

    const all = data?.users ?? [];
    const ids = all.map((u) => String(u.id));

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, full_name, role, plan, status, created_at, last_login')
      .in('id', ids)
      .limit(1000);

    const byId = new Map<string, ProfileRow>();
    for (const p of (profiles ?? []) as ProfileRow[]) {
      byId.set(String(p.id), p);
    }

    const users = all
      .map((u) => {
        const p = byId.get(String(u.id));
        const effectiveRole = String(p?.role ?? '').trim() || appMetaRole(u) || 'user';
        return {
          id: String(u.id),
          email: String(p?.email ?? u.email ?? ''),
          role: effectiveRole,
          plan: String(p?.plan ?? 'free'),
          status: String(p?.status ?? 'active'),
          created_at: String(p?.created_at ?? u.created_at ?? ''),
          last_login: p?.last_login ?? null,
          full_name: String(p?.full_name ?? ''),
        };
      })
      .filter((row) => {
        if (q) {
          const hay = `${row.email} ${row.full_name}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (role && role !== 'all' && row.role !== role) return false;
        if (plan && plan !== 'all' && row.plan !== plan) return false;
        if (status && status !== 'all' && row.status !== status) return false;
        return true;
      });

    return NextResponse.json({ users });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}

