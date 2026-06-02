/**
 * GET /api/liasse/audit-package?companyId=&fiscalYear=
 * Fiscal audit package JSON export (Phase 11 bank/payroll + validation alerts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { exportAuditPackage } from '@/app/lib/atlas-liasse-server';

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
    const pkg = await exportAuditPackage(ctx.db, ctx.userId, companyId, fiscalYear);
    const download = request.nextUrl.searchParams.get('download') === '1';
    if (download) {
      const filename = `liasse-audit-${fiscalYear}.json`;
      return new NextResponse(JSON.stringify(pkg, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }
    return NextResponse.json({ ok: true, package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
