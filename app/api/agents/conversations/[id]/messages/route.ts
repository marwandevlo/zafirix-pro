import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { listAgentMessages, sendAgentMessage } from '@/app/lib/atlas-agents-server';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await params;

  try {
    const messages = await listAgentMessages(ctx.db, ctx.userId, id);
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'list_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const content = String(body.content ?? '').trim();
  if (!content) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 });
  }

  try {
    const result = await sendAgentMessage(ctx.db, ctx.userId, id, content);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed';
    const status = message.includes('not_found') ? 404 : message.includes('ANTHROPIC') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
