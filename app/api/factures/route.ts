/**
 * GET /api/factures?companyId=...[&id=...]
 * List client invoices for the active company with robust error handling.
 * Optional `id` returns a single invoice or empty payload when not found (never 404).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rowToInvoice(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    number: String(row.number ?? ''),
    clientName: String(row.client_name ?? ''),
    issueDate: String(row.issue_date ?? ''),
    dueDate: String(row.due_date ?? ''),
    status: row.status ?? 'sent',
    amountHT: Number(row.amount_ht ?? 0),
    vatAmount: Number(row.vat_amount ?? 0),
    totalTTC: Number(row.total_ttc ?? 0),
    companyId: (row.company_id as string | null) ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAtlasSupabaseSession(request);
    if (!session.ok) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const invoiceId = searchParams.get('id') ?? searchParams.get('invoiceId');

    if (!companyId) {
      return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
    }

    const admin = getSupabaseServiceRoleClient();
    const access = await requireApiCompanyAccess(admin, session.userId, companyId);
    if (!access.ok) {
      return NextResponse.json({ ok: true, invoices: [], total: 0, invoice: null });
    }

    if (invoiceId?.trim()) {
      const { data, error } = await admin
        .from('atlas_invoices')
        .select('*')
        .eq('id', invoiceId.trim())
        .eq('user_id', session.userId)
        .or(`company_id.eq.${access.companyId},company_id.is.null`)
        .maybeSingle();

      if (error) {
        return mapDbError(error, { ok: true, invoices: [], total: 0, invoice: null });
      }

      if (!data) {
        return NextResponse.json({ ok: true, invoices: [], total: 0, invoice: null });
      }

      const invoice = rowToInvoice(data as Record<string, unknown>);
      return NextResponse.json({
        ok: true,
        invoices: [invoice],
        total: 1,
        invoice,
      });
    }

    const { data, error } = await admin
      .from('atlas_invoices')
      .select('*')
      .eq('user_id', session.userId)
      .or(`company_id.eq.${access.companyId},company_id.is.null`)
      .order('issue_date', { ascending: false })
      .limit(500);

    if (error) {
      return mapDbError(error, { ok: true, invoices: [], total: 0, invoice: null });
    }

    const invoices = (data ?? []).map((r) => rowToInvoice(r as Record<string, unknown>));
    return NextResponse.json({
      ok: true,
      invoices,
      total: invoices.length,
      invoice: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json(
      { ok: true, invoices: [], total: 0, invoice: null, warning: message },
      { status: 200 },
    );
  }
}
