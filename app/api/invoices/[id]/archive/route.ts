/**
 * PATCH /api/invoices/[id]/archive
 * Soft-deletes an invoice by setting archived_at.
 * Logs to atlas_entity_events.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params;

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { db, userId } = ctx;

  // Verify ownership + get company_id
  const { data: inv, error: fetchErr } = await db
    .from('atlas_invoices')
    .select('id, company_id, archived_at')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !inv) {
    return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 });
  }

  if ((inv as { archived_at?: string | null }).archived_at) {
    return NextResponse.json({ ok: true, already_archived: true });
  }

  const now = new Date().toISOString();

  const { error } = await db
    .from('atlas_invoices')
    .update({ archived_at: now, updated_at: now })
    .eq('id', invoiceId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log (best-effort)
  const companyId = (inv as { company_id?: string | null }).company_id;
  if (companyId) {
    void db.from('atlas_entity_events').insert({
      user_id: userId,
      company_id: companyId,
      entity_type: 'invoice',
      entity_id: invoiceId,
      event_type: 'archived',
      payload: { archived_at: now },
    });
  }

  return NextResponse.json({ ok: true });
}
