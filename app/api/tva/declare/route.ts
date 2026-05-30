import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { markTvaPeriodDeclared } from '@/app/lib/atlas-tva-server';

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    periodKey?: string;
  };
  const companyId = String(body.companyId ?? '').trim();
  const periodKey = String(body.periodKey ?? '').trim();
  if (!companyId || !periodKey) {
    return NextResponse.json({ error: 'company_and_period_required' }, { status: 400 });
  }

  try {
    const period = await markTvaPeriodDeclared(ctx.db, ctx.userId, companyId, periodKey);
    return NextResponse.json({ period });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'declare_failed';
    const status = message === 'period_not_found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
