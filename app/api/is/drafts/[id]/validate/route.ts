import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { validateIsDraft } from '@/app/lib/atlas-is-server';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(_request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await params;
  try {
    const draft = await validateIsDraft(ctx.db, ctx.userId, id);
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'validate_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
