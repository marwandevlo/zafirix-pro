import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import {
  getTvaDashboard,
  loadCompanySupplierIdentityIndex,
  loadCompanyTvaExportInfo,
} from '@/app/lib/atlas-tva-server';
import {
  generateTvaDeclarationXml,
  tvaDgiXmlFilename,
  validateTvaDgiXmlExport,
} from '@/app/lib/atlas-tva-xml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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
    const [dashboard, company, supplierIndex] = await Promise.all([
      getTvaDashboard(ctx.db, ctx.userId, companyId, { periodKey }),
      loadCompanyTvaExportInfo(ctx.db, companyId),
      loadCompanySupplierIdentityIndex(ctx.db, companyId, ctx.userId),
    ]);

    if (!company) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const exportOpts = {
      company,
      supplierIndex,
      regimeTVA: dashboard.regimeTVA,
      periodKey,
    };

    const validation = validateTvaDgiXmlExport(dashboard.current, exportOpts);

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, message: validation.message },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }

    const xml = generateTvaDeclarationXml(dashboard.current, exportOpts);
    const filename = tvaDgiXmlFilename(periodKey);
    const headers: Record<string, string> = {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    };
    if (validation.warnings?.length) {
      headers['X-Tva-Export-Warnings'] = encodeURIComponent(validation.warnings.join(' | '));
    }

    return new NextResponse(xml, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
