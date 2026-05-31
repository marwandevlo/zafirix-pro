import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { computeAndSaveIsDraft, listIsDrafts } from '@/app/lib/atlas-is-server';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const drafts = await listIsDrafts(ctx.db, ctx.userId, companyId);
    return NextResponse.json({ drafts });
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
    companyId?: string;
    fiscalYear?: number;
  };

  const companyId = String(body.companyId ?? '').trim();
  const fiscalYear = body.fiscalYear ?? new Date().getFullYear();
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const draft = await computeAndSaveIsDraft(ctx.db, ctx.userId, companyId, fiscalYear);
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'compute_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
