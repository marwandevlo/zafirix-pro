/**
 * Liasse Fiscale engine — integrates Phase 11 bank/payroll + accounting/TVA/legal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LiasseAuditPackage,
  LiasseBankSummary,
  LiassePayrollSummary,
  LiasseValidationCheck,
} from '@/app/types/atlas-liasse';

const BALANCE_TOLERANCE = 1;
const TVA_TOLERANCE_PCT = 0.05;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function accountClass(compte: string): number {
  const c = String(compte).trim().charAt(0);
  const n = parseInt(c, 10);
  return Number.isFinite(n) ? n : 0;
}

export type LiasseEngineInput = {
  userId: string;
  companyId: string | null;
  fiscalYear: number;
};

export type LiasseEngineResult = {
  payload: Record<string, unknown>;
  checks: LiasseValidationCheck[];
  blockingIssues: LiasseValidationCheck[];
  readinessScore: number;
  readinessBreakdown: Record<string, number>;
  bankSummary: LiasseBankSummary;
  payrollSummary: LiassePayrollSummary;
};

export async function runLiasseEngine(
  db: SupabaseClient,
  input: LiasseEngineInput,
): Promise<LiasseEngineResult> {
  const { userId, companyId, fiscalYear } = input;
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31`;

  const filterCo = <T extends { company_id?: string | null }>(rows: T[] | null | undefined): T[] => {
    if (!companyId) return rows ?? [];
    return (rows ?? []).filter((r) => !r.company_id || r.company_id === companyId);
  };

  const [
    entriesRes,
    invoicesRes,
    supplierRes,
    statementsRes,
    transactionsRes,
    reconRes,
    payslipsRes,
    payrollRunsRes,
    salariesRes,
    irSnapshotsRes,
    tvaSuggestionsRes,
    legalRes,
    liasseExistsRes,
    paidInvoicesRes,
  ] = await Promise.all([
    db.from('atlas_accounting_entries').select('entry_json, validation_status, company_id').eq('user_id', userId),
    db.from('atlas_invoices').select('id, status, total_ttc, client_name, validation_status, company_id').eq('user_id', userId),
    db.from('atlas_supplier_invoices').select('id, status, amount_ttc, validation_status, company_id').eq('user_id', userId),
    db.from('zafirix_bank_statements').select('id, closing_balance, opening_balance, statement_period_end, company_id').eq('user_id', userId),
    db.from('zafirix_bank_transactions').select('id, debit, credit, amount, transaction_date, description, validation_status, company_id').eq('user_id', userId),
    db.from('atlas_bank_reconciliation').select('transaction_id, status, confidence, entity_type, entity_id, company_id').eq('user_id', userId),
    db.from('atlas_payslip_extractions').select('*').eq('user_id', userId),
    db.from('atlas_payroll_runs').select('*').eq('user_id', userId).eq('period_year', fiscalYear),
    db.from('atlas_salaries').select('gross_salary, net_salary, cnss_employee, ir_amount, payroll_run_id, company_id').eq('user_id', userId),
    db.from('atlas_ir_snapshots').select('*').eq('user_id', userId).eq('period_year', fiscalYear),
    db.from('zafirix_tva_suggestions').select('id, amount_ht, vat_rate, vat_amount, validation_status, metadata, company_id').eq('user_id', userId),
    db.from('zafirix_legal_documents').select('id, title, expiry_date, company_id').eq('user_id', userId),
    db.from('zafirix_liasse_fiscale').select('id, company_id').eq('user_id', userId).eq('fiscal_year', fiscalYear).maybeSingle(),
    db.from('atlas_invoices').select('id, number, client_name, total_ttc, status, company_id').eq('user_id', userId).eq('status', 'paid'),
  ]);

  entriesRes.data = filterCo(entriesRes.data);
  invoicesRes.data = filterCo(invoicesRes.data);
  supplierRes.data = filterCo(supplierRes.data);
  statementsRes.data = filterCo(statementsRes.data);
  transactionsRes.data = filterCo(transactionsRes.data);
  reconRes.data = filterCo(reconRes.data);
  payslipsRes.data = filterCo(payslipsRes.data);
  payrollRunsRes.data = filterCo(payrollRunsRes.data);
  salariesRes.data = filterCo(salariesRes.data);
  irSnapshotsRes.data = filterCo(irSnapshotsRes.data);
  tvaSuggestionsRes.data = filterCo(tvaSuggestionsRes.data);
  legalRes.data = filterCo(legalRes.data);
  paidInvoicesRes.data = filterCo(paidInvoicesRes.data);
  if (companyId && liasseExistsRes.data && liasseExistsRes.data.company_id !== companyId) {
    liasseExistsRes.data = null;
  }

  // ── Accounting aggregates ───────────────────────────────────────────────────
  let totalDebit = 0;
  let totalCredit = 0;
  let actif = 0;
  let passif = 0;
  let bankAccountBalance = 0;
  let draftEntries = 0;

  for (const row of entriesRes.data ?? []) {
    const j = row.entry_json as { compte?: string; debit?: number; credit?: number } | null;
    if (!j) continue;
    const d = Number(j.debit ?? 0);
    const c = Number(j.credit ?? 0);
    totalDebit += d;
    totalCredit += c;
    const cls = accountClass(String(j.compte ?? ''));
    if (cls === 5 || cls === 2) bankAccountBalance += c - d;
    if (cls === 1 || cls === 2) actif += d - c;
    if (cls === 1 && String(j.compte).startsWith('1') && !String(j.compte).startsWith('10')) passif += c - d;
    if (cls === 3) passif += c - d;
    if (row.validation_status === 'draft') draftEntries++;
  }

  // ── Bank ────────────────────────────────────────────────────────────────────
  const transactions = transactionsRes.data ?? [];
  const recons = reconRes.data ?? [];
  const reconByTx = new Map<string, typeof recons>();
  for (const r of recons) {
    const tid = String(r.transaction_id);
    if (!reconByTx.has(tid)) reconByTx.set(tid, []);
    reconByTx.get(tid)!.push(r);
  }

  const fiscalTx = transactions.filter(t => {
    const d = t.transaction_date as string | null;
    return d && d >= yearStart && d <= yearEnd;
  });

  const importedTotal = fiscalTx.reduce((s, t) => s + Number(t.credit ?? 0) - Number(t.debit ?? 0), 0);
  const reconciledCount = recons.filter(r => r.status === 'matched').length;
  const suggestedCount = recons.filter(r => r.status === 'suggested').length;
  const unreconciledCount = recons.filter(r => r.status === 'unmatched').length;

  const statements = statementsRes.data ?? [];
  const lastStmt = statements.sort((a, b) =>
    String(b.statement_period_end ?? '').localeCompare(String(a.statement_period_end ?? '')),
  )[0];
  const lastClosing = lastStmt?.closing_balance != null ? Number(lastStmt.closing_balance) : null;

  let running = lastStmt?.opening_balance != null ? Number(lastStmt.opening_balance) : 0;
  const sortedTx = [...fiscalTx].sort((a, b) =>
    String(a.transaction_date).localeCompare(String(b.transaction_date)),
  );
  for (const t of sortedTx) {
    running += Number(t.credit ?? 0) - Number(t.debit ?? 0);
  }
  const computedClosing = fiscalTx.length > 0 ? round2(running) : null;
  const closingDelta = lastClosing != null && computedClosing != null
    ? round2(Math.abs(lastClosing - computedClosing))
    : null;

  const bankSummary: LiasseBankSummary = {
    statements_count: statements.length,
    transactions_count: fiscalTx.length,
    reconciled_count: reconciledCount,
    suggested_count: suggestedCount,
    unreconciled_count: unreconciledCount,
    accounting_bank_balance: round2(bankAccountBalance),
    imported_transactions_total: round2(importedTotal),
    last_statement_closing: lastClosing,
    computed_closing_from_tx: computedClosing,
    closing_balance_delta: closingDelta,
  };

  // ── Payroll ─────────────────────────────────────────────────────────────────
  const payslips = payslipsRes.data ?? [];
  const fiscalPayslips = payslips.filter(p =>
    (p.period_year as number | null) === fiscalYear || p.period_year == null,
  );
  const runs = payrollRunsRes.data ?? [];
  const salaries = salariesRes.data ?? [];
  const runIds = new Set(runs.map(r => String(r.id)));
  const fiscalSalaries = salaries.filter(s => runIds.has(String(s.payroll_run_id)));

  let grossSal = fiscalPayslips.reduce((s, p) => s + Number(p.gross_salary ?? 0), 0);
  let netSal = fiscalPayslips.reduce((s, p) => s + Number(p.net_salary ?? 0), 0);
  let cnssSal = fiscalPayslips.reduce((s, p) => s + Number(p.cnss_amount ?? 0), 0);
  let irSal = fiscalPayslips.reduce((s, p) => s + Number(p.ir_amount ?? 0), 0);

  if (grossSal === 0 && runs.length > 0) {
    grossSal = runs.reduce((s, r) => s + Number(r.total_gross ?? 0), 0);
    netSal = runs.reduce((s, r) => s + Number(r.total_net ?? 0), 0);
    cnssSal = runs.reduce((s, r) => s + Number(r.total_cnss_employee ?? 0), 0);
    irSal = runs.reduce((s, r) => s + Number(r.total_ir ?? 0), 0);
  }
  if (grossSal === 0) {
    grossSal = fiscalSalaries.reduce((s, r) => s + Number(r.gross_salary ?? 0), 0);
    netSal = fiscalSalaries.reduce((s, r) => s + Number(r.net_salary ?? 0), 0);
    cnssSal = fiscalSalaries.reduce((s, r) => s + Number(r.cnss_employee ?? 0), 0);
    irSal = fiscalSalaries.reduce((s, r) => s + Number(r.ir_amount ?? 0), 0);
  }

  const irSnapshots = irSnapshotsRes.data ?? [];
  if (irSal === 0 && irSnapshots.length > 0) {
    irSal = irSnapshots.reduce((s, r) => s + Number(r.total_ir ?? 0), 0);
  }

  const payrollAnomalies: string[] = [];
  for (const p of fiscalPayslips) {
    if (!p.cnss_number && !p.employee_id) payrollAnomalies.push(`CNSS manquant: ${p.employee_name ?? p.id}`);
    if ((p.match_confidence ?? 0) < 75) payrollAnomalies.push(`Employé non associé: ${p.employee_name ?? '?'}`);
    if (p.validation_status === 'draft') payrollAnomalies.push(`Bulletin brouillon: ${p.employee_name ?? p.id}`);
  }

  const payrollSummary: LiassePayrollSummary = {
    employees: fiscalPayslips.length || fiscalSalaries.length,
    gross_salaries: round2(grossSal),
    net_salaries: round2(netSal),
    cnss_deductions: round2(cnssSal),
    ir_retained: round2(irSal),
    payslips_total: fiscalPayslips.length,
    payslips_validated: fiscalPayslips.filter(p => p.validation_status === 'validated').length,
    payslips_draft: fiscalPayslips.filter(p => p.validation_status === 'draft').length,
    payroll_anomalies: payrollAnomalies.slice(0, 20),
    payroll_run_status: runs[0]?.status as string ?? null,
  };

  // ── Build checks ────────────────────────────────────────────────────────────
  const checks: LiasseValidationCheck[] = [];

  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    checks.push({
      id: 'accounting-unbalanced',
      severity: 'critical',
      category: 'Comptabilité',
      message: `Journal déséquilibré: débit ${round2(totalDebit)} ≠ crédit ${round2(totalCredit)}`,
      blocking: true,
      details: { totalDebit, totalCredit },
    });
  }

  if (Math.abs(actif - passif) > BALANCE_TOLERANCE && actif > 0 && passif > 0) {
    checks.push({
      id: 'bilan-actif-passif',
      severity: 'critical',
      category: 'Bilan',
      message: `Bilan non équilibré: actif ${round2(actif)} ≠ passif ${round2(passif)}`,
      blocking: true,
      details: { actif, passif },
    });
  }

  if (unreconciledCount > 0) {
    checks.push({
      id: 'bank-unreconciled',
      severity: 'critical',
      category: 'Banque',
      message: `${unreconciledCount} opération(s) bancaire(s) non rapprochée(s)`,
      blocking: true,
      details: { unreconciledCount },
    });
  }

  if (suggestedCount > 0) {
    checks.push({
      id: 'bank-suggested-pending',
      severity: 'warning',
      category: 'Banque',
      message: `${suggestedCount} rapprochement(s) en attente de validation`,
      blocking: false,
    });
  }

  if (closingDelta != null && closingDelta > BALANCE_TOLERANCE) {
    checks.push({
      id: 'bank-closing-mismatch',
      severity: 'warning',
      category: 'Banque',
      message: `Écart solde clôture relevé: ${closingDelta} MAD (relevé vs calculé)`,
      blocking: false,
      details: { lastClosing, computedClosing, closingDelta },
    });
  }

  const unmatchedDebits = fiscalTx.filter(t => {
    const rec = reconByTx.get(String(t.id)) ?? [];
    return Number(t.debit) > 0 && (!rec.length || rec.every(r => r.status === 'unmatched'));
  });
  if (unmatchedDebits.length > 0) {
    checks.push({
      id: 'payments-no-entry',
      severity: 'warning',
      category: 'Banque',
      message: `${unmatchedDebits.length} paiement(s) sans écriture comptable rapprochée`,
      blocking: false,
    });
  }

  const matchedEntityIds = new Set(
    recons.filter(r => r.status === 'matched' && r.entity_type === 'sales_invoice').map(r => String(r.entity_id)),
  );
  for (const inv of paidInvoicesRes.data ?? []) {
    if (!matchedEntityIds.has(String(inv.id))) {
      checks.push({
        id: `paid-no-bank-${inv.id}`,
        severity: 'warning',
        category: 'Banque',
        message: `Facture payée sans rapprochement bancaire: ${inv.number ?? inv.id}`,
        blocking: false,
        details: { invoiceId: inv.id },
      });
      break; // one representative warning; count in details
    }
  }
  const paidWithoutBank = (paidInvoicesRes.data ?? []).filter(inv => !matchedEntityIds.has(String(inv.id))).length;
  if (paidWithoutBank > 1) {
    checks.push({
      id: 'paid-invoices-no-bank-batch',
      severity: 'warning',
      category: 'Banque',
      message: `${paidWithoutBank} facture(s) marquée(s) payée(s) sans correspondance bancaire`,
      blocking: false,
      details: { count: paidWithoutBank },
    });
  }

  for (const tva of tvaSuggestionsRes.data ?? []) {
    const meta = (tva.metadata && typeof tva.metadata === 'object') ? tva.metadata as Record<string, unknown> : {};
    const ht = Number(tva.amount_ht ?? meta.amount_ht ?? 0);
    const rate = Number(tva.vat_rate ?? meta.vat_rate ?? 20);
    const detected = Number(tva.vat_amount ?? meta.vat_amount ?? 0);
    const expected = ht * (rate / 100);
    if (ht > 0 && Math.abs(expected - detected) > expected * TVA_TOLERANCE_PCT + 0.5) {
      checks.push({
        id: `tva-inconsistency-${tva.id}`,
        severity: 'critical',
        category: 'TVA',
        message: `Incohérence TVA: attendu ${round2(expected)} MAD, détecté ${round2(detected)} MAD`,
        blocking: true,
        details: { ht, rate, expected, detected },
      });
    }
  }

  if (payrollSummary.payslips_draft > 0) {
    checks.push({
      id: 'payroll-not-validated',
      severity: 'critical',
      category: 'Paie',
      message: `${payrollSummary.payslips_draft} bulletin(s) non validé(s)`,
      blocking: true,
    });
  }

  if (payrollSummary.payslips_total > 0 && payrollSummary.cnss_deductions === 0) {
    checks.push({
      id: 'cnss-missing',
      severity: 'critical',
      category: 'CNSS',
      message: 'CNSS non renseignée sur les bulletins de paie',
      blocking: true,
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const expiredLegal = (legalRes.data ?? []).filter(l => l.expiry_date && String(l.expiry_date) < today);
  if (expiredLegal.length > 0) {
    checks.push({
      id: 'legal-expired',
      severity: 'warning',
      category: 'Juridique',
      message: `${expiredLegal.length} contrat(s) juridique(s) expiré(s)`,
      blocking: false,
    });
  }

  if (!liasseExistsRes.data && fiscalYear < new Date().getFullYear()) {
    checks.push({
      id: 'liasse-not-generated',
      severity: 'warning',
      category: 'Liasse',
      message: `Aucune liasse générée pour l'exercice ${fiscalYear}`,
      blocking: false,
    });
  }

  const draftInvoices = (invoicesRes.data ?? []).filter(i => i.validation_status === 'draft').length;
  const draftSupplier = (supplierRes.data ?? []).filter(i => i.validation_status === 'draft').length;
  if (draftInvoices + draftSupplier > 0) {
    checks.push({
      id: 'invoices-draft',
      severity: 'warning',
      category: 'Factures',
      message: `${draftInvoices + draftSupplier} facture(s) en brouillon`,
      blocking: false,
    });
  }

  const entryCount = entriesRes.data?.length ?? 0;
  const requiredKeys = ['bilan', 'cpc', 'etat_tva', 'etat_cnss', 'etat_ir'] as const;
  const missingSections = requiredKeys.filter((k) => {
    if (entryCount === 0 && (k === 'bilan' || k === 'cpc')) return true;
    return false;
  });
  if (missingSections.length > 0) {
    checks.push({
      id: 'sections-missing',
      severity: 'critical',
      category: 'Liasse',
      message: `Sections requises manquantes: ${missingSections.join(', ')}`,
      blocking: true,
      details: { missing: missingSections },
    });
  }

  // ── Readiness score ─────────────────────────────────────────────────────────
  const breakdown: Record<string, number> = {};
  let score = 0;

  if (Math.abs(totalDebit - totalCredit) <= BALANCE_TOLERANCE) { breakdown.accounting_balanced = 15; score += 15; }
  if (Math.abs(actif - passif) <= BALANCE_TOLERANCE || actif === 0) { breakdown.bilan_balanced = 15; score += 15; }
  const invTotal = (invoicesRes.data?.length ?? 0) + (supplierRes.data?.length ?? 0);
  const invValidated = (invoicesRes.data ?? []).filter(i => i.validation_status === 'validated').length
    + (supplierRes.data ?? []).filter(i => i.validation_status === 'validated').length;
  if (invTotal === 0 || invValidated / invTotal >= 0.8) { breakdown.invoices_validated = 10; score += 10; }
  const hasTvaCritical = checks.some(c => c.id.startsWith('tva-inconsistency'));
  if (!hasTvaCritical) { breakdown.tva_ok = 15; score += 15; }
  const txTotal = fiscalTx.length || 1;
  const reconRatio = reconciledCount / Math.max(txTotal, 1);
  breakdown.bank_reconciled = Math.round(Math.min(20, reconRatio * 20));
  score += breakdown.bank_reconciled;
  if (payrollSummary.payslips_total === 0 || payrollSummary.payslips_draft === 0) {
    breakdown.payroll_validated = 15; score += 15;
  } else if (payrollSummary.payslips_validated / payrollSummary.payslips_total >= 0.8) {
    breakdown.payroll_validated = 10; score += 10;
  }
  const criticalCount = checks.filter(c => c.severity === 'critical').length;
  if (criticalCount === 0) { breakdown.no_critical = 10; score += 10; }
  if (expiredLegal.length === 0) { breakdown.legal_ok = 5; score += 5; }

  const readinessScore = Math.min(100, Math.max(0, score));

  const blockingIssues = checks.filter(c => c.blocking);

  const payload: Record<string, unknown> = {
    fiscal_year: fiscalYear,
    generated_at: new Date().toISOString(),
    bilan: {
      actif: round2(actif),
      passif: round2(passif),
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
    },
    cpc: {
      charges: round2(totalDebit),
      produits: round2(totalCredit),
    },
    etat_tva: {
      suggestions_count: tvaSuggestionsRes.data?.length ?? 0,
    },
    etat_cnss: {
      total_cnss: payrollSummary.cnss_deductions,
      employees: payrollSummary.employees,
    },
    etat_ir: {
      total_ir: payrollSummary.ir_retained,
    },
    annexes: {
      bank: bankSummary,
      payroll: payrollSummary,
    },
    bank_summary: bankSummary,
    payroll_summary: payrollSummary,
  };

  return {
    payload,
    checks,
    blockingIssues,
    readinessScore,
    readinessBreakdown: breakdown,
    bankSummary,
    payrollSummary,
  };
}

/** Liasse-specific dashboard alerts */
export async function collectLiasseAlerts(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
): Promise<Array<{
  id: string;
  severity: 'red' | 'orange' | 'yellow';
  category: string;
  title: string;
  description: string;
  href?: string;
}>> {
  const fiscalYear = new Date().getFullYear();
  const result = await runLiasseEngine(db, { userId, companyId, fiscalYear });
  const alerts: Array<{
    id: string;
    severity: 'red' | 'orange' | 'yellow';
    category: string;
    title: string;
    description: string;
    href?: string;
  }> = [];

  if (result.bankSummary.unreconciled_count > 0) {
    alerts.push({
      id: 'liasse-bank-unreconciled',
      severity: 'red',
      category: 'Clôture fiscale',
      title: 'Transactions bancaires non rapprochées',
      description: `${result.bankSummary.unreconciled_count} opération(s) avant clôture`,
      href: '/banque',
    });
  }

  if (result.payrollSummary.payslips_draft > 0) {
    alerts.push({
      id: 'liasse-payroll-draft',
      severity: 'orange',
      category: 'Clôture fiscale',
      title: 'Bulletins de paie non validés',
      description: `${result.payrollSummary.payslips_draft} bulletin(s) en attente`,
      href: '/rh',
    });
  }

  if (result.payrollSummary.cnss_deductions === 0 && result.payrollSummary.payslips_total > 0) {
    alerts.push({
      id: 'liasse-cnss-missing',
      severity: 'orange',
      category: 'Clôture fiscale',
      title: 'CNSS manquante',
      description: 'Données CNSS absentes avant clôture',
      href: '/rh',
    });
  }

  const tvaCritical = result.checks.filter(c => c.category === 'TVA' && c.severity === 'critical');
  if (tvaCritical.length > 0) {
    alerts.push({
      id: 'liasse-tva-inconsistency',
      severity: 'red',
      category: 'Clôture fiscale',
      title: 'Incohérence TVA détectée',
      description: `${tvaCritical.length} anomalie(s) TVA avant clôture`,
      href: '/tva',
    });
  }

  let liasseQuery = db
    .from('zafirix_liasse_fiscale')
    .select('id')
    .eq('user_id', userId)
    .eq('fiscal_year', fiscalYear);
  if (companyId) liasseQuery = liasseQuery.eq('company_id', companyId);
  else liasseQuery = liasseQuery.is('company_id', null);
  const { data: liasse } = await liasseQuery.maybeSingle();

  if (!liasse) {
    alerts.push({
      id: 'liasse-not-generated',
      severity: 'yellow',
      category: 'Clôture fiscale',
      title: `Liasse ${fiscalYear} non générée`,
      description: 'Générez la liasse fiscale pour l\'exercice en cours',
      href: '/liasse',
    });
  }

  if (result.readinessScore < 70) {
    alerts.push({
      id: 'liasse-low-readiness',
      severity: 'orange',
      category: 'Clôture fiscale',
      title: `Préparation clôture: ${result.readinessScore}%`,
      description: 'Score de préparation insuffisant pour valider la liasse',
      href: '/liasse',
    });
  }

  return alerts;
}

export async function buildAuditPackage(
  db: SupabaseClient,
  userId: string,
  liasseRow: {
    id: string;
    company_id: string | null;
    fiscal_year: number;
    status: string;
    readiness_score: number;
    payload: Record<string, unknown>;
    validation_result: Record<string, unknown>;
  },
): Promise<LiasseAuditPackage> {
  const fiscalYear = liasseRow.fiscal_year;
  const engine = await runLiasseEngine(db, { userId, companyId: liasseRow.company_id, fiscalYear });

  const { data: unreconciledTx } = await db
    .from('zafirix_bank_transactions')
    .select('id, transaction_date, description, debit, credit, amount')
    .eq('user_id', userId)
    .limit(50);

  const unreconciledIds = new Set(
    (await db.from('atlas_bank_reconciliation').select('transaction_id').eq('user_id', userId).eq('status', 'unmatched'))
      .data?.map(r => String(r.transaction_id)) ?? [],
  );
  const unreconciled = (unreconciledTx ?? []).filter(t => unreconciledIds.has(String(t.id)));

  const { data: auditLogs } = await db
    .from('atlas_audit_logs')
    .select('*')
    .eq('performed_by', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: routingDocs } = await db
    .from('zafirix_routing_records')
    .select('source_document_id, target_module')
    .eq('user_id', userId)
    .not('source_document_id', 'is', null)
    .limit(30);

  const docIds = [...new Set((routingDocs ?? []).map(r => r.source_document_id).filter(Boolean))];
  const { data: docs } = docIds.length
    ? await db.from('atlas_documents').select('id, filename, document_type, validation_status').in('id', docIds)
    : { data: [] };

  const checks = (liasseRow.validation_result?.checks as LiasseValidationCheck[]) ?? engine.checks;

  return {
    exported_at: new Date().toISOString(),
    fiscal_year: fiscalYear,
    company_id: liasseRow.company_id,
    readiness_score: Number(liasseRow.readiness_score),
    status: liasseRow.status as 'draft' | 'validated' | 'filed',
    bank_reconciliation_summary: engine.bankSummary,
    unreconciled_transactions: unreconciled,
    payroll_summary: engine.payrollSummary,
    cnss_summary: {
      total_cnss: engine.payrollSummary.cnss_deductions,
      employees: engine.payrollSummary.employees,
      pending: engine.payrollSummary.payslips_draft,
    },
    ir_summary: {
      retained_ir: engine.payrollSummary.ir_retained,
      fiscal_year: fiscalYear,
    },
    validation_alerts: checks,
    bilan_excerpt: (liasseRow.payload?.bilan as Record<string, unknown>) ?? {},
    audit_logs_sample: auditLogs ?? [],
    source_documents: docs ?? [],
  };
}
