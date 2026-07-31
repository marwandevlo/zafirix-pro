/**
 * PATCH /api/invoices/[id]/archive
 * Soft-deletes an invoice by setting archived_at.
 * Logs to atlas_entity_events.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { assertUserCompanyAccess } from '@/app/lib/atlas-company-resource-guard';
import { revalidateCompanySurfaces } from '@/app/lib/revalidate-company-surfaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params;

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { db, userId } = ctx;

  // Verify company workspace access
  const { data: inv, error: fetchErr } = await db
    .from('atlas_invoices')
    .select('id, company_id, archived_at')
    .eq('id', invoiceId)
    .maybeSingle();

  if (fetchErr || !inv?.company_id) {
    return NextResponse.json({ ok: true, not_found: true });
  }

  const companyId = String(inv.company_id);
  const access = await assertUserCompanyAccess(db, userId, companyId);
  if (!access.ok) {
    return NextResponse.json({ ok: true, not_found: true });
  }

  if ((inv as { archived_at?: string | null }).archived_at) {
    return NextResponse.json({ ok: true, already_archived: true });
  }

  const now = new Date().toISOString();

  const { error } = await db
    .from('atlas_invoices')
    .update({ archived_at: now, updated_at: now })
    .eq('id', invoiceId)
    .eq('company_id', companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log (best-effort)
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

  revalidateCompanySurfaces(companyId);
  return NextResponse.json({ ok: true });
}
