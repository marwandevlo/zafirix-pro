/**
 * GET /api/liasse?companyId=&fiscalYear=
 * POST /api/liasse — generate or refresh liasse
 * PATCH /api/liasse — validate or file (blocking rules + admin override)
 */
import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import {
  exportAuditPackage,
  generateLiasse,
  getReadiness,
  loadLiasseRecord,
  updateLiasseStatus,
} from '@/app/lib/atlas-liasse-server';
import type { LiasseFiscalePayload } from '@/app/types/atlas-liasse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseYear(raw: string | null): number {
  const y = Number(raw ?? new Date().getFullYear());
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  const fiscalYear = parseYear(request.nextUrl.searchParams.get('fiscalYear'));
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const record = await loadLiasseRecord(ctx.db, ctx.userId, companyId, fiscalYear);
    const readiness = await getReadiness(ctx.db, ctx.userId, companyId, fiscalYear);
    return NextResponse.json({
      ok: true,
      record: record
        ? {
            id: record.id,
            status: record.status,
            readiness_score: record.readiness_score,
            payload: record.payload as LiasseFiscalePayload,
            blocking_issues: record.blocking_issues,
            admin_override_reason: record.admin_override_reason,
            generated_at: record.generated_at,
            validated_at: record.validated_at,
            filed_at: record.filed_at,
          }
        : null,
      readiness,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'load_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    fiscalYear?: number;
  };
  const companyId = String(body.companyId ?? '').trim();
  const fiscalYear = body.fiscalYear ?? new Date().getFullYear();
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const result = await generateLiasse(ctx.db, ctx.userId, companyId, fiscalYear);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    fiscalYear?: number;
    status?: 'validated' | 'filed';
    adminOverrideReason?: string;
  };
  const companyId = String(body.companyId ?? '').trim();
  const fiscalYear = body.fiscalYear ?? new Date().getFullYear();
  const nextStatus = body.status;
  if (!companyId || !nextStatus || !['validated', 'filed'].includes(nextStatus)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const result = await updateLiasseStatus(
      ctx.db,
      ctx.userId,
      companyId,
      fiscalYear,
      nextStatus,
      body.adminOverrideReason,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, blockers: result.blockers },
        { status: 409 },
      );
    }
    const record = await loadLiasseRecord(ctx.db, ctx.userId, companyId, fiscalYear);
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
