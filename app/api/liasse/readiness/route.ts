/**
 * GET /api/liasse/readiness?companyId=&fiscalYear=
 */
import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { getReadiness } from '@/app/lib/atlas-liasse-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  const fiscalYear = Number(request.nextUrl.searchParams.get('fiscalYear') ?? new Date().getFullYear());
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const readiness = await getReadiness(ctx.db, ctx.userId, companyId, fiscalYear);
    return NextResponse.json({ ok: true, ...readiness });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'readiness_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
