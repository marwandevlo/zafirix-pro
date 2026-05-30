import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { listAgentTasks, parseAgentTypeParam } from '@/app/lib/atlas-agents-server';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const agentType = parseAgentTypeParam(searchParams.get('agentType'));
  const conversationId = searchParams.get('conversationId')?.trim() || undefined;

  try {
    const tasks = await listAgentTasks(ctx.db, ctx.userId, {
      agentType: agentType ?? undefined,
      conversationId,
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'list_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
