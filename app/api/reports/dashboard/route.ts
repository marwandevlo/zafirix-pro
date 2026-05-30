import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { getReportsDashboard, parseReportPeriodParams } from '@/app/lib/atlas-reports-server';

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

  const period = parseReportPeriodParams(request.nextUrl.searchParams);

  try {
    const dashboard = await getReportsDashboard(ctx.db, ctx.userId, companyId, period);
    return NextResponse.json({ dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dashboard_failed';
    const status = message === 'company_not_found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
