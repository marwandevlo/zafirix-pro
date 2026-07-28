/**
 * Load all data required for the master company Excel export.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasIsDraft } from '@/app/types/atlas-payroll';
import type { DgiReleveDeductionRow } from '@/app/lib/atlas-tva-dgi';
import { buildDgiReleveRows } from '@/app/lib/atlas-tva-dgi';
import {
  buildBankExportRows,
  type BankExportRow,
} from '@/app/lib/atlas-bank-export';
import { asRecord } from '@/app/lib/atlas-json';
import {
  computeAndSaveIsDraft,
  getIsDraftForYear,
  loadCompanyIsExportInfo,
} from '@/app/lib/atlas-is-server';
import { getTvaDashboard, loadCompanyTvaExportInfo } from '@/app/lib/atlas-tva-server';
import { getReportsDashboard, resolveReportPeriod } from '@/app/lib/atlas-reports-server';

export type MasterSupplierInvoiceRow = {
  invoiceNumber: string;
  supplierName: string;
  supplierIce: string;
  invoiceDate: string;
  amountHT: number;
  vatRate: number;
  vatAmount: number;
  amountTTC: number;
  statusLabel: string;
};

export type MasterJournalRow = {
  date: string;
  libelle: string;
  compte: string;
  debit: number;
  credit: number;
  sourceDocumentId: string;
  validationStatus: string;
};

export type MasterExportKpis = {
  soldeGlobal: number;
  balanceClients: number;
  balanceFournisseurs: number;
  chiffreAffairesHT: number;
  achatsHT: number;
  tvaNette: number;
  statutFiscal: string;
  transactionsCount: number;
  supplierInvoicesCount: number;
  journalLinesCount: number;
};

export type MasterExportData = {
  companyName: string;
  companyIce: string;
  fiscalYear: number;
  periodLabel: string;
  exportedAt: string;
  kpis: MasterExportKpis;
  supplierInvoices: MasterSupplierInvoiceRow[];
  tvaRows: DgiReleveDeductionRow[];
  tvaPeriodLabel: string;
  isDraft: AtlasIsDraft | null;
  bankRows: BankExportRow[];
  journalRows: MasterJournalRow[];
};

function supplierStatusLabel(status: string | null | undefined): string {
  const key = String(status ?? '').toLowerCase();
  if (key === 'paid' || key === 'payé' || key === 'paye') return 'Payé';
  return 'À payer';
}

function flattenJournalRow(
  row: {
    id: unknown;
    entry_json: unknown;
    entry_date: string | null;
    source_document_id: string | null;
    validation_status: string | null;
  },
): MasterJournalRow | null {
  const entry = asRecord(row.entry_json);
  if (!entry) return null;
  return {
    date: String(entry.date ?? row.entry_date ?? ''),
    libelle: String(entry.libelle ?? ''),
    compte: String(entry.compte ?? ''),
    debit: Number(entry.debit ?? 0),
    credit: Number(entry.credit ?? 0),
    sourceDocumentId: row.source_document_id ? String(row.source_document_id) : '',
    validationStatus: String(row.validation_status ?? 'draft'),
  };
}

export async function loadMasterExportData(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYearParam?: number,
): Promise<MasterExportData> {
  const fiscalYear = fiscalYearParam ?? new Date().getFullYear();
  const period = resolveReportPeriod('year', new Date(fiscalYear, 6, 1));

  const [
    dashboard,
    tvaDashboard,
    companyTvaInfo,
    isDraftRaw,
    supplierRes,
    bankTxRes,
    journalRes,
    bankStmtRes,
    tvaPeriodRes,
  ] = await Promise.all([
    getReportsDashboard(admin, userId, companyId, period),
    getTvaDashboard(admin, userId, companyId, { periodKey: `${fiscalYear}-AN` }).catch(() => null),
    loadCompanyTvaExportInfo(admin, companyId),
    getIsDraftForYear(admin, userId, companyId, fiscalYear),
    admin
      .from('atlas_supplier_invoices')
      .select('invoice_number, supplier_name, supplier_ice, invoice_date, amount_ht, vat_amount, amount_ttc, vat_rate, status')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .order('invoice_date', { ascending: false })
      .limit(5000),
    admin
      .from('zafirix_bank_transactions')
      .select('id, transaction_date, description, reference, debit, credit')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .order('transaction_date', { ascending: false })
      .limit(5000),
    admin
      .from('atlas_accounting_entries')
      .select('id, entry_json, entry_date, source_document_id, validation_status')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .gte('entry_date', period.periodStart)
      .lte('entry_date', period.periodEnd)
      .order('entry_date', { ascending: true })
      .limit(5000),
    admin
      .from('zafirix_bank_statements')
      .select('closing_balance')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .order('statement_period_end', { ascending: false })
      .limit(1),
    admin
      .from('atlas_tva_periods')
      .select('status, tva_nette')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('period_key', `${fiscalYear}-AN`)
      .maybeSingle(),
  ]);

  let isDraft = isDraftRaw;
  if (!isDraft) {
    try {
      isDraft = await computeAndSaveIsDraft(admin, userId, companyId, fiscalYear);
    } catch {
      isDraft = null;
    }
  }

  const txIds = (bankTxRes.data ?? []).map(r => String(r.id));
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

  const bankRows = buildBankExportRows(
    (bankTxRes.data ?? []).map(row => ({
      transactionDate: row.transaction_date as string | null,
      description: row.description as string | null,
      reference: row.reference as string | null,
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      reconciliations: reconByTx.get(String(row.id)) ?? [],
    })),
  );

  const supplierInvoices: MasterSupplierInvoiceRow[] = (supplierRes.data ?? []).map(row => ({
    invoiceNumber: String(row.invoice_number ?? ''),
    supplierName: String(row.supplier_name ?? 'Fournisseur'),
    supplierIce: String(row.supplier_ice ?? ''),
    invoiceDate: String(row.invoice_date ?? ''),
    amountHT: Number(row.amount_ht ?? 0),
    vatRate: Number(row.vat_rate ?? 0),
    vatAmount: Number(row.vat_amount ?? 0),
    amountTTC: Number(row.amount_ttc ?? 0),
    statusLabel: supplierStatusLabel(row.status as string),
  }));

  const journalRows = (journalRes.data ?? [])
    .map(row => flattenJournalRow(row as Parameters<typeof flattenJournalRow>[0]))
    .filter((r): r is MasterJournalRow => r != null);

  const closingBalance = bankStmtRes.data?.[0]?.closing_balance;
  const soldeGlobal = closingBalance != null
    ? Number(closingBalance)
    : bankRows.reduce((s, r) => s + (r.credit ?? 0) - (r.debit ?? 0), 0);

  const balanceFournisseurs = supplierInvoices
    .filter(i => i.statusLabel === 'À payer')
    .reduce((s, i) => s + i.amountTTC, 0);

  const tvaStatus = tvaPeriodRes.data?.status
    ? String(tvaPeriodRes.data.status)
    : tvaDashboard?.status ?? '—';
  const isStatus = isDraft?.status ?? '—';
  const statutFiscal = `TVA: ${tvaStatus} | IS: ${isStatus}`;

  const tvaRecord = tvaDashboard?.current ?? null;
  const tvaRows = tvaRecord ? buildDgiReleveRows(tvaRecord) : [];

  return {
    companyName: dashboard.companyName,
    companyIce: companyTvaInfo?.ice ?? '',
    fiscalYear,
    periodLabel: period.periodLabel,
    exportedAt: new Date().toISOString(),
    kpis: {
      soldeGlobal: Math.round(soldeGlobal * 100) / 100,
      balanceClients: Math.round(dashboard.kpis.facturesImpayeesMontant * 100) / 100,
      balanceFournisseurs: Math.round(balanceFournisseurs * 100) / 100,
      chiffreAffairesHT: Math.round(dashboard.kpis.chiffreAffaires * 100) / 100,
      achatsHT: Math.round(dashboard.kpis.depensesFournisseurs * 100) / 100,
      tvaNette: Math.round(dashboard.kpis.tvaNette * 100) / 100,
      statutFiscal,
      transactionsCount: bankRows.length,
      supplierInvoicesCount: supplierInvoices.length,
      journalLinesCount: journalRows.length,
    },
    supplierInvoices,
    tvaRows,
    tvaPeriodLabel: tvaRecord?.periodLabel ?? `Exercice ${fiscalYear}`,
    isDraft,
    bankRows,
    journalRows,
  };
}

export async function loadMasterExportCompanyName(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<string> {
  void userId;
  const info = await loadCompanyIsExportInfo(admin, companyId);
  return info?.legal_name?.trim() || info?.trade_name?.trim() || info?.name?.trim() || 'Societe';
}
