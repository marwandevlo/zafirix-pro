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

  const status = new URL(request.url).searchParams.get('status');
  const admin = getSupabaseServiceRoleClient();

  let query = admin
    .from('atlas_bank_reconciliation')
    .select('id, transaction_id, entity_type, entity_id, confidence, status, match_reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const summary = {
    matched: rows.filter(r => r.status === 'matched').length,
    suggested: rows.filter(r => r.status === 'suggested').length,
    unmatched: rows.filter(r => r.status === 'unmatched').length,
    rejected: rows.filter(r => r.status === 'rejected').length,
    total: rows.length,
  };

  return NextResponse.json({ ok: true, summary, records: rows });
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
