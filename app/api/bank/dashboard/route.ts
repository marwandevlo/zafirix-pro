/**
 * GET /api/bank/dashboard — banking KPIs for dashboard
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  const admin = getSupabaseServiceRoleClient();

  let txQuery = admin.from('zafirix_bank_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  let stmtQuery = admin.from('zafirix_bank_statements').select('id', { count: 'exact', head: true }).eq('user_id', userId);

  if (companyId) {
    txQuery = txQuery.eq('company_id', companyId);
    stmtQuery = stmtQuery.eq('company_id', companyId);
  }

  const [txCount, stmtCount, txRowsRes] = await Promise.all([
    txQuery,
    stmtQuery,
    companyId
      ? admin.from('zafirix_bank_transactions').select('id').eq('user_id', userId).eq('company_id', companyId)
      : admin.from('zafirix_bank_transactions').select('id').eq('user_id', userId),
  ]);

  const txIds = (txRowsRes.data ?? []).map((r) => String(r.id));
  const { data: reconRows } = txIds.length
    ? await admin
        .from('atlas_bank_reconciliation')
        .select('transaction_id, status')
        .eq('user_id', userId)
        .in('transaction_id', txIds)
    : { data: [] };

  const reconByTx = new Map<string, string[]>();
  for (const r of reconRows ?? []) {
    const tid = String(r.transaction_id);
    if (!reconByTx.has(tid)) reconByTx.set(tid, []);
    reconByTx.get(tid)!.push(String(r.status));
  }

  let reconciled = 0;
  let suggested = 0;
  let unmatched = 0;
  for (const txId of txIds) {
    const statuses = reconByTx.get(txId) ?? [];
    if (statuses.includes('matched')) reconciled += 1;
    else if (statuses.includes('suggested')) suggested += 1;
    else unmatched += 1;
  }

  const kpis = {
    transactions_imported: txCount.count ?? 0,
    statements: stmtCount.count ?? 0,
    reconciled,
    suggested,
    unmatched,
    alerts: unmatched + suggested,
  };

  return NextResponse.json({ ok: true, kpis });
}
