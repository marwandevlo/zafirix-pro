import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasTvaDashboard,
  AtlasTvaLineItem,
  AtlasTvaPeriodCalculation,
  AtlasTvaPeriodRecord,
  AtlasTvaPeriodStatus,
  AtlasTvaPeriodType,
} from '@/app/types/atlas-tva';
import { asRecord } from '@/app/lib/atlas-json';
import { resolveDgiIce } from '@/app/lib/atlas-tva-dgi';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function normalizeRegimeTVA(regime: string | null | undefined): 'mensuel' | 'trimestriel' | 'exonere' {
  const r = String(regime ?? 'mensuel').toLowerCase();
  if (r.includes('trim')) return 'trimestriel';
  if (r.includes('exon')) return 'exonere';
  return 'mensuel';
}

export function periodTypeForRegime(regime: string | null | undefined): AtlasTvaPeriodType {
  return normalizeRegimeTVA(regime) === 'trimestriel' ? 'quarterly' : 'monthly';
}

/** Resolve storage/compute type from an explicit period key (UI selector). */
export function periodTypeForPeriodKey(
  periodKey: string,
  regime: string | null | undefined,
): AtlasTvaPeriodType {
  if (/^\d{4}-AN$/.test(periodKey) || /^\d{4}-Q[1-4]$/.test(periodKey)) return 'quarterly';
  if (/^\d{4}-\d{2}$/.test(periodKey)) return 'monthly';
  return periodTypeForRegime(regime);
}

export function currentPeriodKey(regime: string | null | undefined, ref = new Date()): string {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  if (periodTypeForRegime(regime) === 'quarterly') {
    const q = Math.ceil(m / 3);
    return `${y}-Q${q}`;
  }
  return `${y}-${pad2(m)}`;
}

export function parsePeriodBounds(
  periodKey: string,
  periodType: AtlasTvaPeriodType,
): { periodStart: string; periodEnd: string; periodLabel: string } {
  const annualMatch = periodKey.match(/^(\d{4})-AN$/);
  if (annualMatch) {
    const year = Number(annualMatch[1]);
    return {
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
      periodLabel: `Année ${year}`,
    };
  }

  if (periodType === 'monthly') {
    const [yStr, mStr] = periodKey.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    const last = lastDayOfMonth(year, month);
    return {
      periodStart: `${year}-${pad2(month)}-01`,
      periodEnd: `${year}-${pad2(month)}-${pad2(last)}`,
      periodLabel: `${MONTH_NAMES[month - 1] ?? mStr} ${year}`,
    };
  }

  const match = periodKey.match(/^(\d{4})-Q([1-4])$/);
  if (!match) {
    const now = new Date();
    return parsePeriodBounds(currentPeriodKey('trimestriel', now), 'quarterly');
  }
  const year = Number(match[1]);
  const q = Number(match[2]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const last = lastDayOfMonth(year, endMonth);
  return {
    periodStart: `${year}-${pad2(startMonth)}-01`,
    periodEnd: `${year}-${pad2(endMonth)}-${pad2(last)}`,
    periodLabel: `T${q} ${year}`,
  };
}

/** DGI practice: TVA declaration due by the 20th of the month following the period. */
export function declarationDueDate(
  periodEnd: string,
  _regime: string | null | undefined,
): string {
  const end = new Date(`${periodEnd}T12:00:00`);
  const due = new Date(end.getFullYear(), end.getMonth() + 1, 20);
  return due.toISOString().slice(0, 10);
}

function inPeriod(dateYmd: string, start: string, end: string): boolean {
  return dateYmd >= start && dateYmd <= end;
}

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

function isTvaCollecteeAccount(compte: string): boolean {
  const c = compte.replace(/\s/g, '');
  return c.startsWith('4455') || c.startsWith('4457');
}

function isTvaDeductibleAccount(compte: string): boolean {
  const c = compte.replace(/\s/g, '');
  // PCGE: 4456 (TVA récupérable), 3455x (TVA déductible — used by Documents IA journal lines)
  return c.startsWith('4456') || c.startsWith('3455') || c.startsWith('3456');
}

function isPcge3455Account(compte: string): boolean {
  return compte.replace(/\s/g, '').startsWith('3455');
}

function resolveEntryAccountCode(entry: Record<string, unknown>): string {
  return String(entry.compte ?? entry.account ?? '');
}

function supplierVatAmount(row: SupplierRow): number {
  const vat = Number(row.vat_amount ?? 0);
  if (vat > 0) return vat;
  const ht = Number(row.amount_ht ?? 0);
  const ttc = Number(row.amount_ttc ?? 0);
  if (ttc > ht && ht >= 0) return roundMad(ttc - ht);
  return 0;
}

/** Parse a date string to YYYY-MM-DD without inventing today's date. */
function parseStrictDateYmd(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!parts) return null;
  const [, d, m, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Period assignment date: extracted invoice date first, then upload created_at only.
 * Never defaults to today or the active quarter.
 */
function resolveInvoicePeriodDateYmd(
  invoiceDate: string | null | undefined,
  createdAt: string | null | undefined,
): string | null {
  return parseStrictDateYmd(invoiceDate) ?? parseStrictDateYmd(createdAt);
}

function resolveAccountingEntryDateYmd(
  entryDate: string | null | undefined,
  entryJsonDate: string | null | undefined,
  createdAt: string | null | undefined,
): string | null {
  return (
    parseStrictDateYmd(entryDate) ??
    parseStrictDateYmd(entryJsonDate) ??
    parseStrictDateYmd(createdAt)
  );
}

function isIncludedClientInvoiceStatus(status: string | null | undefined): boolean {
  const s = String(status ?? 'sent').toLowerCase();
  return s !== 'cancelled';
}

/** Supplier invoices: include draft/validated/null; exclude only explicit rejections. */
function isIncludedSupplierValidationStatus(status: string | null | undefined): boolean {
  if (status == null || String(status).trim() === '') return true;
  const s = String(status).toLowerCase();
  if (['rejected', 'archived', 'cancelled', 'refused', 'refuse'].includes(s)) return false;
  if (['draft', 'validated', 'validé', 'valide', 'posted', 'pending', 'pending_review'].includes(s)) {
    return true;
  }
  return true;
}

function isIncludedInvoiceValidationStatus(status: string | null | undefined): boolean {
  const s = String(status ?? 'draft').toLowerCase();
  return !['rejected', 'archived', 'cancelled'].includes(s);
}

function isIncludedTvaSuggestionStatus(status: string | null | undefined): boolean {
  const s = String(status ?? 'pending').toLowerCase();
  return !['rejected'].includes(s);
}

type InvoiceRow = {
  id: string;
  number: string;
  client_name: string;
  issue_date: string;
  status: string;
  amount_ht: number | string | null;
  vat_amount: number | string | null;
  total_ttc: number | string | null;
  vat_rate: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SupplierRow = {
  id: string;
  supplier_name: string;
  supplier_ice?: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  status: string;
  validation_status?: string | null;
  amount_ht: number | string | null;
  vat_amount: number | string | null;
  amount_ttc: number | string | null;
  vat_rate: number | string | null;
  payment_method?: string | null;
  category?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AccountingRow = {
  id: string;
  entry_json: unknown;
  entry_date: string | null;
  source_invoice_id?: string | null;
  validation_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TvaSuggestionRow = {
  id: string;
  tva_type: string;
  amount: number | string | null;
  rate: number | string | null;
  base_ht: number | string | null;
  period_key: string;
  invoice_date: string | null;
  invoice_number: string | null;
  supplier_name: string | null;
  source_document_id: string;
  source_invoice_id: string | null;
  validation_status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Match active company OR legacy rows; merge with all user rows when userId is known. */
async function fetchCompanyScopedRows<T>(
  db: SupabaseClient,
  table: string,
  select: string,
  companyId: string,
  userId?: string,
): Promise<T[]> {
  const runQuery = async (scope: 'company_or_null' | 'user_only'): Promise<T[]> => {
    let query = db.from(table).select(select);
    if (userId) query = query.eq('user_id', userId);
    if (scope === 'company_or_null') {
      query = query.or(`company_id.eq.${companyId},company_id.is.null`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as T[];
  };

  const scoped = await runQuery('company_or_null');
  if (!userId) return scoped;

  const userWide = await runQuery('user_only');
  const seen = new Set<string>();
  const merged: T[] = [];

  const pushRow = (row: T, index: number) => {
    const id = (row as { id?: string }).id;
    const key = id ? String(id) : `${table}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  };

  scoped.forEach((row, index) => pushRow(row, index));
  userWide.forEach((row, index) => pushRow(row, scoped.length + index));
  return merged;
}

export async function computeTvaPeriod(
  db: SupabaseClient,
  companyId: string,
  periodKey: string,
  periodType: AtlasTvaPeriodType,
  userId?: string,
): Promise<AtlasTvaPeriodCalculation> {
  const { periodStart, periodEnd, periodLabel } = parsePeriodBounds(periodKey, periodType);

  const [clientInvoices, supplierInvoices, accountingEntries, suggestions] = await Promise.all([
    fetchCompanyScopedRows<InvoiceRow>(
      db,
      'atlas_invoices',
      'id, number, client_name, issue_date, status, amount_ht, vat_amount, total_ttc, vat_rate, created_at, updated_at',
      companyId,
      userId,
    ),
    fetchCompanyScopedRows<SupplierRow>(
      db,
      'atlas_supplier_invoices',
      'id, supplier_name, supplier_ice, invoice_number, invoice_date, status, validation_status, amount_ht, vat_amount, amount_ttc, vat_rate, payment_method, category, created_at, updated_at',
      companyId,
      userId,
    ),
    fetchCompanyScopedRows<AccountingRow>(
      db,
      'atlas_accounting_entries',
      'id, entry_json, entry_date, source_invoice_id, validation_status, created_at, updated_at',
      companyId,
      userId,
    ),
    fetchCompanyScopedRows<TvaSuggestionRow>(
      db,
      'zafirix_tva_suggestions',
      'id, tva_type, amount, rate, base_ht, period_key, invoice_date, invoice_number, supplier_name, source_document_id, source_invoice_id, validation_status, created_at, updated_at',
      companyId,
      userId,
    ),
  ]);

  const lines: AtlasTvaLineItem[] = [];
  let tvaCollectee = 0;
  let supplierTvaSum = 0;
  let accounting3455TvaSum = 0;
  let caHT = 0;
  let achatsHT = 0;
  let salesCount = 0;
  let purchasesCount = 0;
  const countedInvoiceIds = new Set<string>();

  for (const row of clientInvoices) {
    if (!isIncludedClientInvoiceStatus(row.status)) continue;

    const issueDate = resolveInvoicePeriodDateYmd(row.issue_date, row.created_at);
    if (!issueDate || !inPeriod(issueDate, periodStart, periodEnd)) continue;

    const amountHT = Number(row.amount_ht ?? 0);
    const vatAmount = Number(row.vat_amount ?? 0);
    const totalTTC = Number(row.total_ttc ?? amountHT + vatAmount);
    if (vatAmount <= 0 && amountHT <= 0) continue;

    tvaCollectee += vatAmount;
    caHT += amountHT;
    salesCount += 1;
    countedInvoiceIds.add(String(row.id));
    lines.push({
      id: String(row.id),
      kind: 'sale',
      reference: String(row.number ?? ''),
      counterparty: String(row.client_name ?? ''),
      issueDate,
      amountHT,
      vatAmount,
      totalTTC,
      vatRate: row.vat_rate != null ? Number(row.vat_rate) : undefined,
      source: 'invoice',
    });
  }

  for (const row of supplierInvoices) {
    if (String(row.status).toLowerCase() === 'cancelled') continue;
    if (!isIncludedSupplierValidationStatus(row.validation_status)) continue;

    const issueDate = resolveInvoicePeriodDateYmd(row.invoice_date, row.created_at);
    if (!issueDate || !inPeriod(issueDate, periodStart, periodEnd)) continue;

    const amountHT = Number(row.amount_ht ?? 0);
    const vatAmount = supplierVatAmount(row);
    const totalTTC = Number(row.amount_ttc ?? amountHT + vatAmount);
    if (vatAmount <= 0 && amountHT <= 0) continue;

    supplierTvaSum += vatAmount;
    achatsHT += amountHT;
    purchasesCount += 1;
    countedInvoiceIds.add(String(row.id));
    lines.push({
      id: String(row.id),
      kind: 'purchase',
      reference: String(row.invoice_number ?? row.id.slice(0, 8)),
      counterparty: String(row.supplier_name ?? ''),
      issueDate,
      amountHT,
      vatAmount,
      totalTTC,
      vatRate: row.vat_rate != null ? Number(row.vat_rate) : undefined,
      source: 'supplier_invoice',
      supplierIce: resolveDgiIce(row.supplier_ice) || undefined,
      designation: row.category ? String(row.category) : 'Achats / Services',
      paymentMode: row.payment_method ? String(row.payment_method) : undefined,
      paymentDate: issueDate,
    });
  }

  let suggestionDeductible = 0;
  for (const row of suggestions) {
    if (!isIncludedTvaSuggestionStatus(row.validation_status)) continue;

    const linkedId = row.source_invoice_id ? String(row.source_invoice_id) : '';
    if (linkedId && countedInvoiceIds.has(linkedId)) continue;

    const issueDate = resolveInvoicePeriodDateYmd(row.invoice_date, row.created_at);
    if (!issueDate || !inPeriod(issueDate, periodStart, periodEnd)) continue;

    const vatAmount = Number(row.amount ?? 0);
    const amountHT = Number(row.base_ht ?? 0);
    if (vatAmount <= 0) continue;

    const isDeductible = String(row.tva_type).toLowerCase() === 'deductible';
    if (isDeductible) {
      suggestionDeductible += vatAmount;
      achatsHT += amountHT;
      purchasesCount += 1;
    } else {
      tvaCollectee += vatAmount;
      caHT += amountHT;
      salesCount += 1;
    }

    lines.push({
      id: `tva-${row.id}`,
      kind: isDeductible ? 'purchase' : 'sale',
      reference: String(row.invoice_number ?? row.source_document_id.slice(0, 8)),
      counterparty: String(row.supplier_name ?? 'Suggestion TVA'),
      issueDate,
      amountHT,
      vatAmount,
      totalTTC: amountHT + vatAmount,
      vatRate: row.rate != null ? Number(row.rate) : undefined,
      source: 'tva_suggestion',
    });
  }

  let accountingAdjust = 0;
  for (const row of accountingEntries) {
    const entry = asRecord(row.entry_json);
    if (!entry) continue;

    const date = resolveAccountingEntryDateYmd(
      row.entry_date,
      String(entry.date ?? ''),
      row.created_at,
    );
    if (!date || !inPeriod(date, periodStart, periodEnd)) continue;

    const compte = resolveEntryAccountCode(entry);
    const debit = Number(entry.debit ?? 0);
    const credit = Number(entry.credit ?? 0);
    const libelle = String(entry.libelle ?? 'Écriture comptable');

    if (isPcge3455Account(compte) && debit > 0) {
      accounting3455TvaSum += debit;
      accountingAdjust -= debit;
      lines.push({
        id: `acc-${row.id}`,
        kind: 'purchase',
        reference: compte,
        counterparty: libelle,
        issueDate: date,
        amountHT: 0,
        vatAmount: debit,
        totalTTC: debit,
        source: 'accounting_entry',
      });
      continue;
    }

    if (isTvaDeductibleAccount(compte) && debit > 0 && !isPcge3455Account(compte)) {
      accounting3455TvaSum += debit;
      accountingAdjust -= debit;
      lines.push({
        id: `acc-${row.id}`,
        kind: 'purchase',
        reference: compte,
        counterparty: libelle,
        issueDate: date,
        amountHT: 0,
        vatAmount: debit,
        totalTTC: debit,
        source: 'accounting_entry',
      });
      continue;
    }

    if (isTvaCollecteeAccount(compte) && credit > 0) {
      tvaCollectee += credit;
      accountingAdjust += credit;
      lines.push({
        id: `acc-${row.id}`,
        kind: 'sale',
        reference: compte,
        counterparty: libelle,
        issueDate: date,
        amountHT: 0,
        vatAmount: credit,
        totalTTC: credit,
        source: 'accounting_entry',
      });
    }
  }

  const journalOrSupplierDeductible = Math.max(supplierTvaSum, accounting3455TvaSum);
  let tvaDeductible = journalOrSupplierDeductible + suggestionDeductible;

  console.log('[TVA Server]', {
    companyId,
    userId: userId ?? null,
    periodKey,
    supplierCount: supplierInvoices.length,
    suggestionsCount: suggestions.length,
    clientCount: clientInvoices.length,
    accountingCount: accountingEntries.length,
    supplierTvaSum: roundMad(supplierTvaSum),
    accounting3455TvaSum: roundMad(accounting3455TvaSum),
    journalOrSupplierDeductible: roundMad(journalOrSupplierDeductible),
    suggestionDeductible: roundMad(suggestionDeductible),
  });

  tvaCollectee = roundMad(tvaCollectee);
  tvaDeductible = roundMad(tvaDeductible);
  const tvaNette = roundMad(tvaCollectee - tvaDeductible);

  return {
    periodKey,
    periodType,
    periodLabel,
    periodStart,
    periodEnd,
    tvaCollectee,
    tvaDeductible,
    tvaNette,
    caHT: roundMad(caHT),
    achatsHT: roundMad(achatsHT),
    salesCount,
    purchasesCount,
    accountingTvaAdjustments: roundMad(accountingAdjust),
    lines: lines.sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
  };
}

function rowToPeriodRecord(row: Record<string, unknown>): AtlasTvaPeriodRecord {
  const snapshot = asRecord(row.snapshot_json) ?? {};
  const lines = Array.isArray(snapshot.lines) ? (snapshot.lines as AtlasTvaLineItem[]) : [];
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    periodKey: String(row.period_key),
    periodType: String(row.period_type) as AtlasTvaPeriodType,
    periodLabel: String(snapshot.periodLabel ?? row.period_key),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    tvaCollectee: Number(row.tva_collectee ?? 0),
    tvaDeductible: Number(row.tva_deductible ?? 0),
    tvaNette: Number(row.tva_nette ?? 0),
    caHT: Number(row.ca_ht ?? 0),
    achatsHT: Number(row.achats_ht ?? 0),
    salesCount: Number(row.sales_count ?? 0),
    purchasesCount: Number(row.purchases_count ?? 0),
    accountingTvaAdjustments: Number(snapshot.accountingTvaAdjustments ?? 0),
    lines,
    status: (String(row.status) === 'declared' ? 'declared' : 'pending') as AtlasTvaPeriodStatus,
    declarationDueDate: String(row.declaration_due_date),
    declaredAt: row.declared_at == null ? null : String(row.declared_at),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

async function loadCompanyRegime(db: SupabaseClient, companyId: string): Promise<string> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('company_json')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !data) return 'mensuel';
  const json = asRecord((data as { company_json: unknown }).company_json);
  return String(json?.regimeTVA ?? 'mensuel');
}

export type AtlasTvaExportCompanyInfo = {
  name: string | null;
  legal_name: string | null;
  trade_name: string | null;
  ice: string | null;
  if_fiscal: string | null;
  if_number: string | null;
  rc: string | null;
};

export async function loadCompanyTvaExportInfo(
  db: SupabaseClient,
  companyId: string,
): Promise<AtlasTvaExportCompanyInfo | null> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('name, legal_name, trade_name, ice, if_fiscal, if_number, rc, company_json')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const json = asRecord(row.company_json);
  return {
    name: row.name == null ? null : String(row.name),
    legal_name: row.legal_name == null ? null : String(row.legal_name),
    trade_name: row.trade_name == null ? null : String(row.trade_name),
    ice: row.ice == null ? (json?.ice == null ? null : String(json.ice)) : String(row.ice),
    if_fiscal:
      row.if_fiscal == null ? (json?.if_fiscal == null ? null : String(json.if_fiscal)) : String(row.if_fiscal),
    if_number: row.if_number == null ? null : String(row.if_number),
    rc: row.rc == null ? (json?.rc == null ? null : String(json.rc)) : String(row.rc),
  };
}

export async function syncTvaPeriodRecord(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  periodKey: string,
  periodType: AtlasTvaPeriodType,
  regime: string,
): Promise<AtlasTvaPeriodRecord> {
  const calc = await computeTvaPeriod(db, companyId, periodKey, periodType, userId);
  const due = declarationDueDate(calc.periodEnd, regime);
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from('atlas_tva_periods')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_type', periodType)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (existing && String((existing as Record<string, unknown>).status) === 'declared') {
    return rowToPeriodRecord(existing as Record<string, unknown>);
  }

  const payload = {
    user_id: userId,
    company_id: companyId,
    period_type: periodType,
    period_key: periodKey,
    period_start: calc.periodStart,
    period_end: calc.periodEnd,
    tva_collectee: calc.tvaCollectee,
    tva_deductible: calc.tvaDeductible,
    tva_nette: calc.tvaNette,
    ca_ht: calc.caHT,
    achats_ht: calc.achatsHT,
    sales_count: calc.salesCount,
    purchases_count: calc.purchasesCount,
    declaration_due_date: due,
    snapshot_json: {
      periodLabel: calc.periodLabel,
      accountingTvaAdjustments: calc.accountingTvaAdjustments,
      lines: calc.lines.slice(0, 200),
    },
    updated_at: now,
  };

  if (existing) {
    const { data, error } = await db
      .from('atlas_tva_periods')
      .update(payload)
      .eq('id', String((existing as Record<string, unknown>).id))
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'update_failed');
    return rowToPeriodRecord(data as Record<string, unknown>);
  }

  const { data, error } = await db
    .from('atlas_tva_periods')
    .insert({ ...payload, status: 'pending' })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'insert_failed');
  return rowToPeriodRecord(data as Record<string, unknown>);
}

export async function getTvaDashboard(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  opts?: { periodKey?: string | null },
): Promise<AtlasTvaDashboard> {
  const regime = await loadCompanyRegime(db, companyId);
  const periodKey = opts?.periodKey?.trim() || currentPeriodKey(regime);
  const periodType = periodTypeForPeriodKey(periodKey, regime);
  const current = await syncTvaPeriodRecord(db, userId, companyId, periodKey, periodType, regime);

  return {
    companyId,
    regimeTVA: regime,
    current,
    nextDeclarationDate: current.declarationDueDate,
    amountDue: current.tvaNette,
    status: current.status,
    selectedPeriodKey: periodKey,
  };
}

/** Latest quarter/year key in a given calendar year that has TVA activity. */
export async function findLatestTvaPeriodKeyWithData(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  year: number,
): Promise<string | null> {
  const candidates = [`${year}-AN`, `${year}-Q4`, `${year}-Q3`, `${year}-Q2`, `${year}-Q1`];
  for (const periodKey of candidates) {
    const periodType = periodTypeForPeriodKey(periodKey, 'trimestriel');
    const calc = await computeTvaPeriod(db, companyId, periodKey, periodType, userId);
    if (calc.tvaCollectee > 0 || calc.tvaDeductible > 0 || calc.lines.length > 0) {
      return periodKey;
    }
  }
  return null;
}

export async function listTvaHistory(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  opts?: { limit?: number; year?: number },
): Promise<{ periods: AtlasTvaPeriodRecord[]; regimeTVA: string }> {
  const regime = await loadCompanyRegime(db, companyId);
  const limit = opts?.limit ?? 24;

  if (opts?.year) {
    const year = opts.year;
    const keys = [`${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`, `${year}-AN`];
    await Promise.all(
      keys.map((key) =>
        syncTvaPeriodRecord(db, userId, companyId, key, periodTypeForPeriodKey(key, regime), regime),
      ),
    );

    const { data, error } = await db
      .from('atlas_tva_periods')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .in('period_key', keys)
      .order('period_end', { ascending: false });

    if (error) throw new Error(error.message);
    return {
      regimeTVA: regime,
      periods: (data ?? []).map((r) => rowToPeriodRecord(r as Record<string, unknown>)),
    };
  }

  const periodType = periodTypeForRegime(regime);

  const keys: string[] = [];
  const ref = new Date();
  for (let i = 0; i < limit; i += 1) {
    if (periodType === 'monthly') {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
    } else {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i * 3, 1);
      const q = Math.ceil((d.getMonth() + 1) / 3);
      const key = `${d.getFullYear()}-Q${q}`;
      if (!keys.includes(key)) keys.push(key);
    }
  }

  await Promise.all(
    keys.map((key) => syncTvaPeriodRecord(db, userId, companyId, key, periodType, regime)),
  );

  const { data, error } = await db
    .from('atlas_tva_periods')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('period_type', periodType)
    .order('period_end', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return {
    regimeTVA: regime,
    periods: (data ?? []).map((r) => rowToPeriodRecord(r as Record<string, unknown>)),
  };
}

export async function deleteTvaPeriodRecords(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  periodIds: string[],
): Promise<number> {
  if (periodIds.length === 0) return 0;

  const { data, error } = await db
    .from('atlas_tva_periods')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('id', periodIds)
    .select('id');

  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

export async function markTvaPeriodDeclared(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  periodKey: string,
): Promise<AtlasTvaPeriodRecord> {
  const regime = await loadCompanyRegime(db, companyId);
  const periodType = periodTypeForPeriodKey(periodKey, regime);
  await syncTvaPeriodRecord(db, userId, companyId, periodKey, periodType, regime);

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('atlas_tva_periods')
    .update({ status: 'declared', declared_at: now, updated_at: now })
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('period_type', periodType)
    .eq('period_key', periodKey)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('period_not_found');
  return rowToPeriodRecord(data as Record<string, unknown>);
}

export function formatTvaContextForAgent(dashboard: AtlasTvaDashboard): string {
  const c = dashboard.current;
  return [
    '[Contexte TVA société — données réelles ZAFIRIX PRO]',
    `Régime: ${dashboard.regimeTVA}`,
    `Période en cours: ${c.periodLabel} (${c.periodStart} → ${c.periodEnd})`,
    `TVA collectée: ${c.tvaCollectee.toLocaleString('fr-MA')} MAD`,
    `TVA déductible: ${c.tvaDeductible.toLocaleString('fr-MA')} MAD`,
    `TVA nette à payer: ${c.tvaNette.toLocaleString('fr-MA')} MAD`,
    `CA HT ventes: ${c.caHT.toLocaleString('fr-MA')} MAD (${c.salesCount} factures)`,
    `Achats HT: ${c.achatsHT.toLocaleString('fr-MA')} MAD (${c.purchasesCount} factures fournisseur)`,
    `Prochaine échéance déclaration: ${dashboard.nextDeclarationDate}`,
    `Statut période: ${c.status === 'declared' ? 'déclarée' : 'en attente'}`,
    'Utilise ces chiffres pour répondre aux questions TVA de l\'utilisateur.',
  ].join('\n');
}

export async function buildFiscalTvaContext(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<string | null> {
  try {
    const dashboard = await getTvaDashboard(db, userId, companyId);
    return formatTvaContextForAgent(dashboard);
  } catch {
    return null;
  }
}
