import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireAdmin } from '@/app/lib/admin/require-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SubRowLoose = Record<string, unknown>;

type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function isMissingSubscriptionsTable(error: DbErrorLike): boolean {
  const code = String(error.code ?? '');
  const message = String(error.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes("could not find the table 'public.subscriptions'") ||
    message.includes('relation "public.subscriptions" does not exist') ||
    (message.includes('subscriptions') && message.includes('does not exist'))
  );
}

function classifyDbError(error: DbErrorLike): string {
  if (isMissingSubscriptionsTable(error)) return 'subscriptions_table_missing';
  return 'db_error';
}

function errorPayload(params: {
  error: string;
  message?: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  debug?: Record<string, unknown>;
}): Record<string, unknown> {
  // Admin routes: always surface actionable diagnostics (auth already gated by requireAdmin).
  return {
    error: params.error,
    ...(params.message ? { message: params.message } : {}),
    ...(params.code ? { code: params.code } : {}),
    ...(params.details ? { details: params.details } : {}),
    ...(params.hint ? { hint: params.hint } : {}),
    ...(params.debug && process.env.NODE_ENV === 'development' ? { debug: params.debug } : {}),
  };
}

function logAndRespondDbError(context: string, error: DbErrorLike) {
  const classified = classifyDbError(error);
  console.error(`[api/admin/subscriptions] ${context}`, {
    classified,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
  return NextResponse.json(
    errorPayload({
      error: classified,
      message: error.message ?? classified,
      code: error.code ?? null,
      details: error.details ?? null,
      hint:
        error.hint ??
        (classified === 'subscriptions_table_missing'
          ? 'Run supabase/migrations/20260727000000_create_subscriptions_table.sql in the Supabase SQL Editor.'
          : null),
    }),
    { status: 500 },
  );
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
      return logAndRespondDbError('subscriptions_query_failed', error as DbErrorLike);
    }

    const raw = (subs ?? []) as SubRowLoose[];
    const userIds = Array.from(new Set(raw.map((r) => String(r.user_id ?? '')).filter(Boolean)));

    let profs: Array<{ id: string; email: string | null }> = [];
    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await admin
        .from('profiles')
        .select('id, email')
        .in('id', userIds)
        .limit(500);

      if (profileError) {
        console.error('[api/admin/subscriptions] profiles_lookup_failed', {
          code: (profileError as DbErrorLike).code ?? null,
          message: profileError.message,
          details: (profileError as DbErrorLike).details ?? null,
          hint: (profileError as DbErrorLike).hint ?? null,
          userIdCount: userIds.length,
        });
      } else {
        profs = (profileRows ?? []) as Array<{ id: string; email: string | null }>;
      }
    }

    const emailById = new Map<string, string>();
    for (const p of profs) {
      emailById.set(String(p.id), String(p.email ?? ''));
    }

    const rows = raw.map((r) => ({
      id: String(r.id ?? ''),
      user_id: String(r.user_id ?? ''),
      email: emailById.get(String(r.user_id ?? '')) || String(r.user_email ?? ''),
      status: String(r.status ?? ''),
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? ''),
      plan: String((r.plan ?? r.plan_id ?? r.plan_slug ?? '') as string),
    }));

    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/subscriptions] unexpected_error', { message: msg, stack: e instanceof Error ? e.stack : undefined });
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
      return logAndRespondDbError('subscriptions_update_failed', error as DbErrorLike);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/subscriptions] unexpected_error', { message: msg, stack: e instanceof Error ? e.stack : undefined });
    return NextResponse.json(errorPayload({ error: 'db_error', message: msg }), { status: 500 });
  }
}
