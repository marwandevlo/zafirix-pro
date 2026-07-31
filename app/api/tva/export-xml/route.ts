import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { dgiDeclarationRegime } from '@/app/lib/atlas-tva-dgi';
import { getTvaDashboard, loadCompanyTvaExportInfo } from '@/app/lib/atlas-tva-server';
import {
  generateTvaDeclarationXml,
  tvaDgiXmlFilename,
  validateTvaDgiExport,
} from '@/app/lib/atlas-tva-xml';

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

    const xml = generateTvaDeclarationXml(dashboard.current, {
      company,
      regime: dgiDeclarationRegime(dashboard.regimeTVA),
    });
    const filename = tvaDgiXmlFilename(periodKey);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
