import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireAdmin } from '@/app/lib/admin/require-admin';

type SubRowLoose = Record<string, unknown>;

function errorPayload(params: {
  error: string;
  message?: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  debug?: Record<string, unknown>;
}): Record<string, unknown> {
  const isDev = process.env.NODE_ENV === 'development';
  return isDev
    ? {
        error: params.error,
        ...(params.message ? { message: params.message } : {}),
        ...(params.code ? { code: params.code } : {}),
        ...(params.details ? { details: params.details } : {}),
        ...(params.hint ? { hint: params.hint } : {}),
        ...(params.debug ? { debug: params.debug } : {}),
      }
    : { error: params.error };
}

export async function GET(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
    try {
      admin = getSupabaseServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[api/admin/subscriptions] service_role_missing', { message: msg });
      return NextResponse.json(errorPayload({ error: 'service_role_missing', message: msg }), { status: 500 });
    }

    const { data: subs, error } = await admin
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[api/admin/subscriptions] subscriptions_query_failed', {
        code: (error as unknown as { code?: string }).code,
        message: error.message,
        details: (error as unknown as { details?: string }).details,
        hint: (error as unknown as { hint?: string }).hint,
      });
      return NextResponse.json(
        errorPayload({
          error: 'db_error',
          message: error.message,
          code: (error as unknown as { code?: string }).code ?? null,
          details: (error as unknown as { details?: string }).details ?? null,
          hint: (error as unknown as { hint?: string }).hint ?? null,
        }),
        { status: 500 },
      );
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/subscriptions] unexpected_error', { message: msg });
    return NextResponse.json(errorPayload({ error: 'db_error', message: msg }), { status: 500 });
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

    let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
    try {
      admin = getSupabaseServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[api/admin/subscriptions] service_role_missing', { message: msg });
      return NextResponse.json(errorPayload({ error: 'service_role_missing', message: msg }), { status: 500 });
    }
    const { error } = await admin
      .from('subscriptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[api/admin/subscriptions] subscriptions_update_failed', {
        code: (error as unknown as { code?: string }).code,
        message: error.message,
        details: (error as unknown as { details?: string }).details,
        hint: (error as unknown as { hint?: string }).hint,
      });
      return NextResponse.json(
        errorPayload({
          error: 'db_error',
          message: error.message,
          code: (error as unknown as { code?: string }).code ?? null,
          details: (error as unknown as { details?: string }).details ?? null,
          hint: (error as unknown as { hint?: string }).hint ?? null,
        }),
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/subscriptions] unexpected_error', { message: msg });
    return NextResponse.json(errorPayload({ error: 'db_error', message: msg }), { status: 500 });
  }
}

