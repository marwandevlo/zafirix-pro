import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { getTvaDashboard, findLatestTvaPeriodKeyWithData } from '@/app/lib/atlas-tva-server';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_required' }, { status: 400 });
  }

  const periodKey = request.nextUrl.searchParams.get('periodKey');
  const detectLatest = request.nextUrl.searchParams.get('detectLatest') === '1';
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();

  try {
    let resolvedPeriodKey = periodKey?.trim() || undefined;
    if (detectLatest && !resolvedPeriodKey) {
      resolvedPeriodKey =
        (await findLatestTvaPeriodKeyWithData(ctx.db, ctx.userId, companyId, year)) ?? undefined;
    }
    const dashboard = await getTvaDashboard(ctx.db, ctx.userId, companyId, {
      periodKey: resolvedPeriodKey,
    });
    return NextResponse.json({ dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dashboard_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
