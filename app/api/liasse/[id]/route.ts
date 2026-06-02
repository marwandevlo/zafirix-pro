/**
 * GET /api/liasse/[id] — fetch liasse record
 * PATCH /api/liasse/[id] — update status (validated/filed) with blocking rules
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { canTransitionLiasseStatus, mapLiasseRow } from '@/app/lib/atlas-liasse-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { LiasseStatus } from '@/app/types/atlas-liasse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await ctx.params;
  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('zafirix_liasse_fiscale')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ ok: true, record: mapLiasseRow(data as Parameters<typeof mapLiasseRow>[0]) });
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: LiasseStatus;
    adminOverrideReason?: string;
  };

  const nextStatus = body.status;
  if (!nextStatus || !['draft', 'validated', 'filed'].includes(nextStatus)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const { data: existing, error: fetchErr } = await admin
    .from('zafirix_liasse_fiscale')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const blocking = Array.isArray(existing.blocking_issues)
    ? (existing.blocking_issues as { blocking?: boolean }[])
    : [];

  const gate = canTransitionLiasseStatus(nextStatus, blocking, body.adminOverrideReason);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: gate.error,
        blockingIssues: blocking,
        message: 'Validation ou dépôt impossible tant que les blocages critiques ne sont pas résolus. Fournissez un motif admin (≥ 10 caractères) pour outrepasser.',
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now,
  };

  if (nextStatus === 'validated') patch.validated_at = now;
  if (nextStatus === 'filed') {
    patch.filed_at = now;
    if (!existing.validated_at) patch.validated_at = now;
  }

  const override = String(body.adminOverrideReason ?? '').trim();
  if (override.length >= 10) {
    patch.admin_override_reason = override;
  }

  const { data, error } = await admin
    .from('zafirix_liasse_fiscale')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, record: mapLiasseRow(data as Parameters<typeof mapLiasseRow>[0]) });
}
