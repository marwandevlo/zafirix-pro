/**
 * GET /api/factures?companyId=...
 * List client invoices for the active company with robust error handling.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
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
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) {
    return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) {
    return apiForbidden(apiErrorMessageFr(access.error));
  }

  const { data, error } = await admin
    .from('atlas_invoices')
    .select('*')
    .eq('user_id', session.userId)
    .or(`company_id.eq.${access.companyId},company_id.is.null`)
    .order('issue_date', { ascending: false })
    .limit(500);

  if (error) {
    return mapDbError(error, { invoices: [], total: 0 });
  }

  return NextResponse.json({
    ok: true,
    invoices: (data ?? []).map((r) => rowToInvoice(r as Record<string, unknown>)),
    total: data?.length ?? 0,
  });
}
