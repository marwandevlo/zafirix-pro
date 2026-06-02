/**
 * GET /api/bank/transactions
 * Query: statementId, status, search, limit, offset
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const statementId = searchParams.get('statementId');
  const status = searchParams.get('status');
  const search = searchParams.get('search')?.trim();
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '100', 10));
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const admin = getSupabaseServiceRoleClient();
  let query = admin
    .from('zafirix_bank_transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statementId) query = query.eq('statement_id', statementId);
  if (status && status !== 'all') query = query.eq('validation_status', status);
  if (search) query = query.or(`description.ilike.%${search}%,reference.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const txIds = (data ?? []).map(r => String(r.id));
  const { data: recons } = txIds.length
    ? await admin.from('atlas_bank_reconciliation').select('id, transaction_id, status, confidence, entity_type, entity_id, match_reason').in('transaction_id', txIds)
    : { data: [] };

  type ReconRow = { id: string; transaction_id: string; status: string; confidence: number; entity_type: string; entity_id: string; match_reason?: string };
  const reconByTx = new Map<string, ReconRow[]>();
  for (const r of (recons ?? []) as ReconRow[]) {
    const tid = String(r.transaction_id);
    if (!reconByTx.has(tid)) reconByTx.set(tid, []);
    reconByTx.get(tid)!.push(r);
  }

  const transactions = (data ?? []).map(row => ({
    id: row.id,
    statementId: row.statement_id,
    sourceDocumentId: row.source_document_id,
    accountNumber: row.account_number,
    transactionDate: row.transaction_date,
    valueDate: row.value_date,
    description: row.description,
    reference: row.reference,
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    amount: Number(row.amount ?? 0),
    balance: row.balance != null ? Number(row.balance) : null,
    currency: row.currency ?? 'MAD',
    validationStatus: row.validation_status,
    confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
    reconciliations: reconByTx.get(String(row.id)) ?? [],
    createdAt: row.created_at,
  }));

  return NextResponse.json({ ok: true, transactions, total: count ?? transactions.length });
}
