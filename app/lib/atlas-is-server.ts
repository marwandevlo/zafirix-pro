import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasIsDraft } from '@/app/types/atlas-payroll';
import { asRecord } from '@/app/lib/atlas-json';
import {
  calculateEstimatedIS,
  calculateMinimalISContribution,
  EXPERT_DISCLAIMER,
  IS_FORMULA_VERSION,
  isRateLabel,
} from '@/app/lib/atlas-payroll-calculations';

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

async function assertCompanyOwned(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('company_not_found');
}

function rowToIsDraft(row: Record<string, unknown>): AtlasIsDraft {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    fiscalYear: Number(row.fiscal_year),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    revenueHT: Number(row.revenue_ht ?? 0),
    supplierExpensesHT: Number(row.supplier_expenses_ht ?? 0),
    payrollTotal: Number(row.payroll_total ?? 0),
    accountingCharges: Number(row.accounting_charges ?? 0),
    taxableResult: Number(row.taxable_result ?? 0),
    estimatedIS: Number(row.estimated_is ?? 0),
    minimalContribution: Number(row.minimal_contribution ?? 0),
    isDue: Number(row.is_due ?? 0),
    status: String(row.status) === 'validated' ? 'validated' : 'draft',
    formulaVersion: String(row.formula_version ?? IS_FORMULA_VERSION),
    sourcesJson: asRecord(row.sources_json) ?? {},
    disclaimer: String(row.disclaimer ?? EXPERT_DISCLAIMER),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export async function listIsDrafts(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<AtlasIsDraft[]> {
  await assertCompanyOwned(db, userId, companyId);
  const { data, error } = await db
    .from('atlas_is_drafts')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('fiscal_year', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToIsDraft(r as Record<string, unknown>));
}

export async function computeAndSaveIsDraft(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
): Promise<AtlasIsDraft> {
  await assertCompanyOwned(db, userId, companyId);

  const periodStart = `${fiscalYear}-01-01`;
  const periodEnd = `${fiscalYear}-12-31`;

  const [invRes, supRes, accRes, payrollRes] = await Promise.all([
    db
      .from('atlas_invoices')
      .select('amount_ht, status, issue_date')
      .eq('company_id', companyId)
      .gte('issue_date', periodStart)
      .lte('issue_date', periodEnd),
    db
      .from('atlas_supplier_invoices')
      .select('amount_ht, invoice_date')
      .eq('company_id', companyId)
      .gte('invoice_date', periodStart)
      .lte('invoice_date', periodEnd),
    db
      .from('atlas_accounting_entries')
      .select('entry_json, entry_date')
      .eq('company_id', companyId)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd),
    db
      .from('atlas_payroll_runs')
      .select('total_gross, period_year')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('period_year', fiscalYear),
  ]);

  if (invRes.error) throw new Error(invRes.error.message);
  if (supRes.error) throw new Error(supRes.error.message);
  if (accRes.error) throw new Error(accRes.error.message);

  const revenueHT = (invRes.data ?? [])
    .filter((i) => String((i as { status: string }).status) !== 'cancelled')
    .reduce((s, i) => s + Number((i as { amount_ht: number | null }).amount_ht ?? 0), 0);

  const supplierExpensesHT = (supRes.data ?? []).reduce(
    (s, r) => s + Number((r as { amount_ht: number | null }).amount_ht ?? 0),
    0,
  );

  let accountingCharges = 0;
  for (const row of accRes.data ?? []) {
    const entry = asRecord((row as { entry_json: unknown }).entry_json);
    if (!entry) continue;
    const compte = String(entry.compte ?? '');
    const debit = Number(entry.debit ?? 0);
    if (debit > 0 && !compte.startsWith('445') && !compte.startsWith('512')) {
      accountingCharges += debit;
    }
  }

  const payrollTotal = payrollRes.error
    ? 0
    : (payrollRes.data ?? []).reduce(
        (s, r) => s + Number((r as { total_gross: number }).total_gross ?? 0),
        0,
      );

  const totalExpenses = roundMad(supplierExpensesHT + payrollTotal + accountingCharges);
  const taxableResult = roundMad(revenueHT - totalExpenses);
  const estimatedIS = calculateEstimatedIS(taxableResult);
  const minimalContribution = calculateMinimalISContribution(revenueHT);
  const isDue = roundMad(Math.max(estimatedIS, minimalContribution));

  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    company_id: companyId,
    fiscal_year: fiscalYear,
    period_start: periodStart,
    period_end: periodEnd,
    revenue_ht: roundMad(revenueHT),
    supplier_expenses_ht: roundMad(supplierExpensesHT),
    payroll_total: roundMad(payrollTotal),
    accounting_charges: roundMad(accountingCharges),
    taxable_result: taxableResult,
    estimated_is: estimatedIS,
    minimal_contribution: minimalContribution,
    is_due: isDue,
    status: 'draft',
    formula_version: IS_FORMULA_VERSION,
    disclaimer: EXPERT_DISCLAIMER,
    sources_json: {
      invoiceCount: (invRes.data ?? []).length,
      supplierInvoiceCount: (supRes.data ?? []).length,
      accountingEntryCount: (accRes.data ?? []).length,
      payrollRunCount: payrollRes.error ? 0 : (payrollRes.data ?? []).length,
      appliedRate: isRateLabel(taxableResult),
    },
    updated_at: now,
  };

  const { data: existing } = await db
    .from('atlas_is_drafts')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('fiscal_year', fiscalYear)
    .maybeSingle();

  if (existing && String((existing as Record<string, unknown>).status) === 'validated') {
    const { data: kept } = await db
      .from('atlas_is_drafts')
      .select('*')
      .eq('id', String((existing as Record<string, unknown>).id))
      .single();
    if (!kept) throw new Error('draft_not_found');
    return rowToIsDraft(kept as Record<string, unknown>);
  }

  if (existing) {
    const { data, error } = await db
      .from('atlas_is_drafts')
      .update(payload)
      .eq('id', String((existing as Record<string, unknown>).id))
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'update_failed');
    return rowToIsDraft(data as Record<string, unknown>);
  }

  const { data, error } = await db.from('atlas_is_drafts').insert(payload).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'insert_failed');
  return rowToIsDraft(data as Record<string, unknown>);
}

export async function validateIsDraft(
  db: SupabaseClient,
  userId: string,
  draftId: string,
): Promise<AtlasIsDraft> {
  const { data, error } = await db
    .from('atlas_is_drafts')
    .update({ status: 'validated', updated_at: new Date().toISOString() })
    .eq('id', draftId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('draft_not_found');
  return rowToIsDraft(data as Record<string, unknown>);
}

export async function getIsDraftForYear(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
): Promise<AtlasIsDraft | null> {
  await assertCompanyOwned(db, userId, companyId);
  const { data, error } = await db
    .from('atlas_is_drafts')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('fiscal_year', fiscalYear)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToIsDraft(data as Record<string, unknown>) : null;
}

export async function getIsDraftById(
  db: SupabaseClient,
  userId: string,
  draftId: string,
): Promise<AtlasIsDraft | null> {
  const { data, error } = await db
    .from('atlas_is_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToIsDraft(data as Record<string, unknown>) : null;
}

export type AtlasIsExportCompanyInfo = {
  name: string | null;
  legal_name: string | null;
  trade_name: string | null;
  if_fiscal: string | null;
  if_number: string | null;
  ice: string | null;
};

export async function loadCompanyIsExportInfo(
  db: SupabaseClient,
  companyId: string,
): Promise<AtlasIsExportCompanyInfo | null> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('name, legal_name, trade_name, if_fiscal, if_number, ice, company_json')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const json = asRecord(row.company_json);
  return {
    name: row.name == null ? null : String(row.name),
    legal_name: row.legal_name == null ? null : String(row.legal_name),
    trade_name: row.trade_name == null ? null : String(row.trade_name),
    if_fiscal:
      row.if_fiscal == null ? (json?.if_fiscal == null ? null : String(json.if_fiscal)) : String(row.if_fiscal),
    if_number: row.if_number == null ? null : String(row.if_number),
    ice: row.ice == null ? (json?.ice == null ? null : String(json.ice)) : String(row.ice),
  };
}
