import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { buildEtat9421Data, loadCompanyIrExportInfo, validateEtat9421ForExport } from '@/app/lib/atlas-ir-server';
import { etat9421ExcelFilename, generateEtat9421ExcelBuffer } from '@/app/lib/atlas-ir-excel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  const fiscalYearParam = request.nextUrl.searchParams.get('fiscalYear');
  const fiscalYear = fiscalYearParam ? Number(fiscalYearParam) : new Date().getFullYear();

  if (!companyId) {
    return NextResponse.json({ error: 'company_required' }, { status: 400, headers: NO_STORE });
  }

  try {
    const { data: owned } = await ctx.db
      .from('atlas_companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE });

    const [data, company] = await Promise.all([
      buildEtat9421Data(ctx.db, ctx.userId, companyId, fiscalYear),
      loadCompanyIrExportInfo(ctx.db, companyId),
    ]);
    if (!company) return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE });

    const validation = validateEtat9421ForExport(data);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, message: validation.message },
        { status: 422, headers: NO_STORE },
      );
    }

    const buffer = await generateEtat9421ExcelBuffer(data, company);
    const filename = etat9421ExcelFilename(fiscalYear);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}
