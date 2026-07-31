import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { generateTvaReleveExcelBuffer, tvaReleveExcelFilename } from '@/app/lib/atlas-tva-excel';
import { getTvaDashboard, loadCompanyTvaExportInfo } from '@/app/lib/atlas-tva-server';
import { validateTvaDgiExport } from '@/app/lib/atlas-tva-xml';

export const runtime = 'nodejs';
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
  const periodKey = request.nextUrl.searchParams.get('periodKey')?.trim();
  if (!companyId || !periodKey) {
    return NextResponse.json(
      { error: 'company_and_period_required' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const [dashboard, company] = await Promise.all([
      getTvaDashboard(ctx.db, ctx.userId, companyId, { periodKey }),
      loadCompanyTvaExportInfo(ctx.db, companyId),
    ]);

    if (!company) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const validation = validateTvaDgiExport(dashboard.current, { company });
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, message: validation.message },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }

    const buffer = await generateTvaReleveExcelBuffer(dashboard.current, company);
    const filename = tvaReleveExcelFilename(periodKey);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
