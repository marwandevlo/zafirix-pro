/**
 * GET /api/bank/reconciliation — summary + list
 * PATCH /api/bank/reconciliation — validate/reject match
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';
import { runReconciliationForTransactions } from '@/app/lib/atlas-bank-reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const companyId = searchParams.get('companyId')?.trim();
  const admin = getSupabaseServiceRoleClient();

  let txQuery = admin
    .from('zafirix_bank_transactions')
    .select('id')
    .eq('user_id', userId);
  if (companyId) txQuery = txQuery.eq('company_id', companyId);

  const { data: txRows, error: txErr } = await txQuery;
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const txIds = (txRows ?? []).map((r) => String(r.id));
  if (txIds.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { matched: 0, suggested: 0, unmatched: 0, rejected: 0, total: 0 },
      records: [],
    });
  }

  let reconQuery = admin
    .from('atlas_bank_reconciliation')
    .select('id, transaction_id, entity_type, entity_id, confidence, status, match_reason, created_at')
    .eq('user_id', userId)
    .in('transaction_id', txIds)
    .order('created_at', { ascending: false })
    .limit(500);

  if (status) reconQuery = reconQuery.eq('status', status);

  const { data, error } = await reconQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const reconByTx = new Map<string, typeof rows>();
  for (const r of rows) {
    const tid = String(r.transaction_id);
    if (!reconByTx.has(tid)) reconByTx.set(tid, []);
    reconByTx.get(tid)!.push(r);
  }

  let matched = 0;
  let suggested = 0;
  let unmatched = 0;
  let rejected = 0;

  for (const txId of txIds) {
    const recons = reconByTx.get(txId) ?? [];
    const statuses = recons.map((r) => r.status);
    if (statuses.includes('matched')) {
      matched += 1;
    } else if (statuses.includes('suggested')) {
      suggested += 1;
    } else if (statuses.includes('rejected')) {
      rejected += 1;
    } else {
      unmatched += 1;
    }
  }

  const summary = {
    matched,
    suggested,
    unmatched,
    rejected,
    total: txIds.length,
  };

  return NextResponse.json({ ok: true, summary, records: rows.slice(0, 100) });
}

export async function PATCH(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { id?: string; action?: 'validate' | 'reject' | 'rerun'; transactionIds?: string[]; companyId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const admin = getSupabaseServiceRoleClient();

  if (body.action === 'rerun' && body.transactionIds?.length && body.companyId) {
    const result = await runReconciliationForTransactions(admin, userId, body.companyId, body.transactionIds);
    return NextResponse.json({ ok: true, ...result });
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'id_and_action_required' }, { status: 400 });
  }

  const newStatus = body.action === 'validate' ? 'matched' : 'rejected';
  const { data, error } = await admin
    .from('atlas_bank_reconciliation')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .eq('user_id', userId)
    .select('transaction_id, entity_type, entity_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAuditEvent({
    entityType: 'bank_transaction',
    entityId: String(data?.transaction_id),
    action: body.action === 'validate' ? 'validated' : 'rejected',
    performedBy: userId,
    metadata: { reconciliation_id: body.id, entity_type: data?.entity_type },
  });

  return NextResponse.json({ ok: true, status: newStatus });
}
