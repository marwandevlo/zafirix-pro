import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import {
  createAgentConversation,
  listAgentConversations,
  parseAgentTypeParam,
} from '@/app/lib/atlas-agents-server';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const agentType = parseAgentTypeParam(searchParams.get('agentType'));
  const companyId = searchParams.get('companyId')?.trim() || null;

  try {
    const conversations = await listAgentConversations(ctx.db, ctx.userId, {
      agentType: agentType ?? undefined,
      companyId,
    });
    return NextResponse.json({ conversations });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'list_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as {
    agentType?: string;
    companyId?: string | null;
    title?: string;
  };

  const agentType = parseAgentTypeParam(body.agentType);
  if (!agentType) {
    return NextResponse.json({ error: 'invalid_agent_type' }, { status: 400 });
  }

  try {
    const conversation = await createAgentConversation(ctx.db, ctx.userId, {
      agentType,
      companyId: body.companyId ?? null,
      title: body.title,
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
