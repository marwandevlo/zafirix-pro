import { NextRequest, NextResponse } from 'next/server';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { generateTvaReleveExcelBuffer, tvaReleveExcelFilename } from '@/app/lib/atlas-tva-excel';
import {
  getTvaDashboard,
  loadCompanySupplierIdentityIndex,
  loadCompanyTvaExportInfo,
} from '@/app/lib/atlas-tva-server';
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

  const access = await requireApiCompanyAccess(ctx.db, ctx.userId, companyId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403, headers: NO_STORE_HEADERS });
  }

  try {
    const [dashboard, company, supplierIndex] = await Promise.all([
      getTvaDashboard(ctx.db, ctx.userId, access.companyId, { periodKey }),
      loadCompanyTvaExportInfo(ctx.db, access.companyId),
      loadCompanySupplierIdentityIndex(ctx.db, access.companyId, ctx.userId),
    ]);

    if (!company) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const validation = validateTvaDgiExport(dashboard.current, { company, supplierIndex });
    const buffer = await generateTvaReleveExcelBuffer(dashboard.current, company);
    const filename = tvaReleveExcelFilename(periodKey);
    const headers: Record<string, string> = {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    };
    if (validation.warnings?.length) {
      headers['X-Tva-Export-Warnings'] = encodeURIComponent(validation.warnings.join(' | '));
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
