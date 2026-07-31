import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { listTvaHistory, deleteTvaPeriodRecords } from '@/app/lib/atlas-tva-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_required' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const yearParam = request.nextUrl.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : undefined;

  try {
    const history = await listTvaHistory(ctx.db, ctx.userId, companyId, { year });
    return NextResponse.json(history, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'history_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  let body: { companyId?: string; ids?: string[] };
  try {
    body = (await request.json()) as { companyId?: string; ids?: string[] };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const companyId = body.companyId?.trim();
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];
  if (!companyId || ids.length === 0) {
    return NextResponse.json({ error: 'company_and_ids_required' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const deleted = await deleteTvaPeriodRecords(ctx.db, ctx.userId, companyId, ids);
    return NextResponse.json({ ok: true, deleted }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'delete_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
