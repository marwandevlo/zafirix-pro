import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireAdmin } from '@/app/lib/admin/require-admin';

type SubRowLoose = Record<string, unknown>;

function devErrorPayload(error: unknown): Record<string, unknown> {
  if (process.env.NODE_ENV !== 'development') return { error: 'db_error' };
  if (error instanceof Error) return { error: 'db_error', message: error.message };
  return { error: 'db_error', message: String(error) };
}

export async function GET(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const admin = getSupabaseServiceRoleClient();

    const { data: subs, error } = await admin
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json(devErrorPayload(new Error(error.message)), { status: 500 });
    }

    const raw = (subs ?? []) as SubRowLoose[];
    const userIds = Array.from(new Set(raw.map((r) => String(r.user_id ?? '')).filter(Boolean)));

    const { data: profs } =
      userIds.length === 0
        ? { data: [] as Array<{ id: string; email: string | null }> }
        : await admin.from('profiles').select('id, email').in('id', userIds).limit(500);

    const emailById = new Map<string, string>();
    for (const p of (profs ?? []) as Array<{ id: string; email: string | null }>) {
      emailById.set(String(p.id), String(p.email ?? ''));
    }

    const rows = raw.map((r) => ({
      id: String(r.id ?? ''),
      user_id: String(r.user_id ?? ''),
      email: emailById.get(String(r.user_id ?? '')) ?? '',
      status: String(r.status ?? ''),
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? ''),
      plan: String((r.plan ?? r.plan_id ?? '') as string),
    }));

    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(devErrorPayload(e), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = (await request.json().catch(() => null)) as null | { id?: string; status?: string };
    const id = String(body?.id ?? '').trim();
    const status = String(body?.status ?? '').trim();
    if (!id || !status) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

    const admin = getSupabaseServiceRoleClient();
    const { error } = await admin
      .from('subscriptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json(devErrorPayload(new Error(error.message)), { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(devErrorPayload(e), { status: 500 });
  }
}

