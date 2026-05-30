import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { getAgentOverviewStats } from '@/app/lib/atlas-agents-server';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId')?.trim() || null;

  try {
    const stats = await getAgentOverviewStats(ctx.db, ctx.userId, companyId);
    return NextResponse.json({ stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stats_failed';
    if (message.includes('does not exist') || message.includes('schema cache')) {
      return NextResponse.json(
        { error: 'agents_tables_missing', message: 'Exécutez la migration atlas_agents dans Supabase.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
