import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { getReportByType, parseReportPeriodParams, parseReportType } from '@/app/lib/atlas-reports-server';

type RouteParams = { params: Promise<{ type: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { type: typeParam } = await params;
  const reportType = parseReportType(typeParam);
  if (!reportType) {
    return NextResponse.json({ error: 'invalid_report_type' }, { status: 400 });
  }

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_required' }, { status: 400 });
  }

  const period = parseReportPeriodParams(request.nextUrl.searchParams);

  try {
    const report = await getReportByType(ctx.db, ctx.userId, companyId, reportType, period);
    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'report_failed';
    const status = message === 'company_not_found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
