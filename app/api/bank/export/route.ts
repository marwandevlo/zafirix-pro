/**
 * GET /api/bank/export
 * Query: companyId, format=csv|xlsx, status, search, recon=matched|suggested|unmatched|all
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  bankExportFilename,
  bankReconTone,
  buildBankExportCsv,
  buildBankExportExcelBuffer,
  buildBankExportRows,
  type BankExportTransaction,
} from '@/app/lib/atlas-bank-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId')?.trim();
  const format = (searchParams.get('format') ?? 'xlsx').toLowerCase();
  const status = searchParams.get('status');
  const search = searchParams.get('search')?.trim();
  const recon = searchParams.get('recon') ?? 'all';

  if (!companyId) {
    return NextResponse.json(
      { error: 'company_required', message: 'Société active requise.' },
      { status: 400, headers: NO_STORE },
    );
  }

  if (format !== 'csv' && format !== 'xlsx') {
    return NextResponse.json({ error: 'invalid_format' }, { status: 400, headers: NO_STORE });
  }

  const admin = getSupabaseServiceRoleClient();

  const { data: companyRow } = await admin
    .from('atlas_companies')
    .select('id, raisonSociale, company_json')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!companyRow) {
    return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE });
  }

  let txQuery = admin
    .from('zafirix_bank_transactions')
    .select('id, transaction_date, description, reference, debit, credit, validation_status')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .order('transaction_date', { ascending: false })
    .limit(5000);

  if (status && status !== 'all') txQuery = txQuery.eq('validation_status', status);
  if (search) txQuery = txQuery.or(`description.ilike.%${search}%,reference.ilike.%${search}%`);

  const { data: txData, error: txErr } = await txQuery;
  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500, headers: NO_STORE });
  }

  const txIds = (txData ?? []).map(r => String(r.id));
  const { data: recons } = txIds.length
    ? await admin
        .from('atlas_bank_reconciliation')
        .select('transaction_id, status')
        .eq('user_id', userId)
        .in('transaction_id', txIds)
    : { data: [] };

  const reconByTx = new Map<string, { status: string }[]>();
  for (const r of recons ?? []) {
    const tid = String(r.transaction_id);
    if (!reconByTx.has(tid)) reconByTx.set(tid, []);
    reconByTx.get(tid)!.push({ status: String(r.status) });
  }

  let transactions: BankExportTransaction[] = (txData ?? []).map(row => ({
    transactionDate: row.transaction_date as string | null,
    description: row.description as string | null,
    reference: row.reference as string | null,
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    reconciliations: reconByTx.get(String(row.id)) ?? [],
  }));

  if (recon !== 'all') {
    transactions = transactions.filter(tx => bankReconTone(tx.reconciliations) === recon);
  }

  const rows = buildBankExportRows(transactions);
  const companyJson = companyRow.company_json;
  const companyName =
    (companyRow.raisonSociale as string | null)?.trim() ||
    (companyJson && typeof companyJson === 'object'
      ? String((companyJson as Record<string, unknown>).raisonSociale ?? '')
      : '') ||
    'Societe';
  const year = new Date().getFullYear();
  const filename = bankExportFilename(companyName, year, format);
  const title = `Opérations bancaires — ${companyName} — ${year}`;

  if (format === 'csv') {
    const csv = buildBankExportCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer = await buildBankExportExcelBuffer(rows, title);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
