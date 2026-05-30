import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { listTvaHistory } from '@/app/lib/atlas-tva-server';

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

  try {
    const history = await listTvaHistory(ctx.db, ctx.userId, companyId);
    return NextResponse.json(history);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'history_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
