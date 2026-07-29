import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { scanFiscalCompliance } from '@/app/lib/atlas-fiscal-compliance-scanner';

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
    const { data: owned } = await ctx.db
      .from('atlas_companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: 'company_not_found' }, { status: 404 });

    const result = await scanFiscalCompliance(ctx.db, ctx.userId, companyId, fiscalYear);
    return NextResponse.json({ ok: true, scan: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'scan_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
