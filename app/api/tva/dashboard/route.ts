import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import {
  findLatestTvaPeriodKeyWithData,
  getTvaDashboard,
  loadCompanyTvaExportInfo,
} from '@/app/lib/atlas-tva-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_required' }, { status: 400, headers: NO_STORE_HEADERS });
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
    const [dashboard, companyExportInfo] = await Promise.all([
      getTvaDashboard(ctx.db, ctx.userId, companyId, {
        periodKey: resolvedPeriodKey,
      }),
      loadCompanyTvaExportInfo(ctx.db, companyId),
    ]);
    return NextResponse.json({ dashboard, companyExportInfo }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dashboard_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
