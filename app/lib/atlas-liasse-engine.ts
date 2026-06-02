/**
 * Liasse Fiscale engine — aggregates Phase 11 bank/payroll + accounting/TVA/legal.
 * Validation checks, readiness score (0–100), blocking rules, audit package.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LiasseAuditPackage,
  LiasseCheck,
  LiasseFiscalePayload,
  LiasseReadinessFactors,
} from '@/app/types/atlas-liasse';

const TOLERANCE_MAD = 1;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function accountClass(compte: string): string {
  return (compte || '').trim().charAt(0);
}

/** Build account balances from journal lines */
function balancesFromEntries(
  entries: { compte: string; debit: number; credit: number }[],
): Map<string, { debit: number; credit: number }> {
  const map = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    const key = e.compte || '000';
    const cur = map.get(key) ?? { debit: 0, credit: 0 };
    cur.debit += e.debit;
    cur.credit += e.credit;
    map.set(key, cur);
  }
  return map;
}

function bilanFromBalances(balances: Map<string, { debit: number; credit: number }>): {
  actif: number;
  passif: number;
  balanced: boolean;
} {
  let actif = 0;
  let passif = 0;
  for (const [compte, { debit, credit }] of balances) {
    const cls = accountClass(compte);
    const net = debit - credit;
    if (['2', '3', '5'].includes(cls) && net > 0) actif += net;
    if (['1', '4'].includes(cls) && net < 0) passif += Math.abs(net);
    if (cls === '1' && net > 0) passif += net;
    if (['4'].includes(cls) && net > 0) passif += net;
  }
  return {
    actif: round(actif),
    passif: round(passif),
    balanced: Math.abs(actif - passif) <= TOLERANCE_MAD,
  };
}

function accountingBankBalance(balances: Map<string, { debit: number; credit: number }>): number {
  let bank = 0;
  for (const [compte, { debit, credit }] of balances) {
    if (compte.startsWith('512') || compte.startsWith('514')) {
      bank += debit - credit;
    }
  }
  return round(bank);
}

export type LiasseEngineInput = {
  userId: string;
  companyId: string;
  companyName: string;
  fiscalYear: number;
};

export async function buildLiassePayload(
  db: SupabaseClient,
  input: LiasseEngineInput,
): Promise<LiasseFiscalePayload> {
  const { userId, companyId, companyName, fiscalYear } = input;
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31`;
  const checks: LiasseCheck[] = [];

  // ── Accounting entries ──────────────────────────────────────────────────────
  const { data: accRows } = await db
    .from('atlas_accounting_entries')
    .select('entry_json, validation_status')
    .eq('user_id', userId);

  const entries = (accRows ?? []).map(row => {
    const j = row.entry_json as { date?: string; libelle?: string; compte?: string; debit?: number; credit?: number } | null;
    return {
      compte: String(j?.compte ?? ''),
      debit: Number(j?.debit ?? 0),
      credit: Number(j?.credit ?? 0),
      date: j?.date,
    };
  }).filter(e => {
    if (!e.date) return true;
    return e.date >= yearStart && e.date <= yearEnd;
  });

  const balances = balancesFromEntries(entries);
  const totalDebit = round(entries.reduce((s, e) => s + e.debit, 0));
  const totalCredit = round(entries.reduce((s, e) => s + e.credit, 0));
  const bilan = bilanFromBalances(balances);
  const accBankBalance = accountingBankBalance(balances);

  if (!bilan.balanced) {
    checks.push({
      id: 'bilan-imbalance',
      category: 'accounting',
      severity: 'critical',
      title: 'Bilan déséquilibré',
      description: `Actif ${bilan.actif} MAD ≠ Passif ${bilan.passif} MAD`,
      blocking: true,
    });
  }

  // ── Bank (Phase 11) ─────────────────────────────────────────────────────────
  const { data: statements } = await db
    .from('zafirix_bank_statements')
    .select('id, closing_balance, opening_balance, statement_period_end')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(5);

  const latestStatement = statements?.[0];
  const statementClosing = latestStatement?.closing_balance != null
    ? Number(latestStatement.closing_balance)
    : null;

  const closingMismatch = statementClosing != null
    && Math.abs(accBankBalance - statementClosing) > TOLERANCE_MAD * 10;

  if (closingMismatch) {
    checks.push({
      id: 'bank-closing-mismatch',
      category: 'bank',
      severity: 'critical',
      title: 'Écart solde bancaire',
      description: `Comptabilité ${accBankBalance} MAD vs relevé ${statementClosing} MAD`,
      blocking: true,
    });
  }

  const { data: bankTx } = await db
    .from('zafirix_bank_transactions')
    .select('id, amount, debit, credit, transaction_date, description')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .gte('transaction_date', yearStart)
    .lte('transaction_date', yearEnd);

  const txList = bankTx ?? [];
  const txIds = txList.map(t => String(t.id));

  const { data: recons } = txIds.length
    ? await db.from('atlas_bank_reconciliation')
      .select('transaction_id, status, confidence, entity_type, entity_id')
      .in('transaction_id', txIds)
    : { data: [] };

  const reconByTx = new Map<string, string>();
  for (const r of recons ?? []) {
    reconByTx.set(String(r.transaction_id), String(r.status));
  }

  let reconciledAmount = 0;
  let unreconciledAmount = 0;
  let unreconciledCount = 0;
  for (const tx of txList) {
    const amt = Number(tx.amount ?? 0);
    const st = reconByTx.get(String(tx.id));
    if (st === 'matched') reconciledAmount += amt;
    else if (!st || st === 'unmatched' || st === 'suggested') {
      unreconciledAmount += amt;
      unreconciledCount++;
    }
  }

  if (unreconciledCount > 0) {
    checks.push({
      id: 'bank-unreconciled',
      category: 'bank',
      severity: unreconciledCount > 5 ? 'critical' : 'warning',
      title: 'Opérations bancaires non rapprochées',
      description: `${unreconciledCount} opération(s) · ${round(unreconciledAmount)} MAD`,
      blocking: unreconciledCount > 0,
    });
  }

  // Payments without accounting entries (bank debit, no 512 credit movement match — heuristic: unreconciled debits)
  const paymentsWithoutEntries = txList.filter(tx => {
    const debit = Number(tx.debit ?? 0);
    return debit > 0 && (reconByTx.get(String(tx.id)) === 'unmatched' || !reconByTx.get(String(tx.id)));
  }).length;

  if (paymentsWithoutEntries > 0) {
    checks.push({
      id: 'bank-no-entry',
      category: 'bank',
      severity: 'warning',
      title: 'Paiements sans écriture comptable',
      description: `${paymentsWithoutEntries} paiement(s) non rapproché(s)`,
      blocking: false,
    });
  }

  // Invoices marked paid but no bank match
  const { data: paidInvoices } = await db
    .from('atlas_invoices')
    .select('id, number, total_ttc, status')
    .eq('user_id', userId)
    .in('status', ['paid', 'validated']);

  const matchedInvoiceIds = new Set(
    (recons ?? [])
      .filter(r => r.status === 'matched' && String(r.entity_type) === 'sales_invoice')
      .map(r => String(r.entity_id)),
  );

  const paidNoBank = (paidInvoices ?? []).filter(
    inv => !matchedInvoiceIds.has(String(inv.id)),
  ).length;

  if (paidNoBank > 0) {
    checks.push({
      id: 'invoice-paid-no-bank',
      category: 'invoices',
      severity: 'warning',
      title: 'Factures payées sans rapprochement bancaire',
      description: `${paidNoBank} facture(s) client`,
      blocking: false,
    });
  }

  const bank: LiasseFiscalePayload['bank'] = {
    accounting_bank_balance: accBankBalance,
    statement_closing_balance: statementClosing,
    closing_balance_mismatch: closingMismatch,
    transactions_imported: txList.length,
    reconciled_amount: round(reconciledAmount),
    unreconciled_amount: round(unreconciledAmount),
    unreconciled_count: unreconciledCount,
    payments_without_entries: paymentsWithoutEntries,
    paid_invoices_no_bank_match: paidNoBank,
  };

  // ── Payroll (Phase 11) ──────────────────────────────────────────────────────
  const { data: payslips } = await db
    .from('atlas_payslip_extractions')
    .select('*')
    .eq('user_id', userId)
    .eq('company_id', companyId);

  const payslipList = payslips ?? [];
  const fiscalPayslips = payslipList.filter(p => Number(p.period_year) === fiscalYear);

  const { data: payrollRuns } = await db
    .from('atlas_payroll_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_year', fiscalYear);

  const runs = payrollRuns ?? [];
  const { data: salaries } = runs.length
    ? await db.from('atlas_salaries').select('gross_salary, net_salary, cnss_employee, ir_amount').in('payroll_run_id', runs.map(r => String(r.id)))
    : { data: [] };

  let grossSalaries = fiscalPayslips.reduce((s, p) => s + Number(p.gross_salary ?? 0), 0);
  let netSalaries = fiscalPayslips.reduce((s, p) => s + Number(p.net_salary ?? 0), 0);
  let cnssDed = fiscalPayslips.reduce((s, p) => s + Number(p.cnss_amount ?? 0), 0);
  let irRet = fiscalPayslips.reduce((s, p) => s + Number(p.ir_amount ?? 0), 0);

  for (const sal of salaries ?? []) {
    grossSalaries += Number(sal.gross_salary ?? 0);
    netSalaries += Number(sal.net_salary ?? 0);
    cnssDed += Number(sal.cnss_employee ?? 0);
    irRet += Number(sal.ir_amount ?? 0);
  }

  const { data: irSnap } = await db
    .from('atlas_ir_snapshots')
    .select('total_ir, total_gross')
    .eq('company_id', companyId)
    .eq('period_year', fiscalYear);

  if (irSnap?.length) {
    irRet = Math.max(irRet, irSnap.reduce((s, r) => s + Number(r.total_ir ?? 0), 0));
    grossSalaries = Math.max(grossSalaries, irSnap.reduce((s, r) => s + Number(r.total_gross ?? 0), 0));
  }

  const payslipsDraft = fiscalPayslips.filter(p => p.validation_status === 'draft').length;
  const payslipsValidated = fiscalPayslips.filter(p => p.validation_status === 'validated').length;
  const payrollAnomalies = fiscalPayslips.filter(p => !p.employee_id || (p.match_confidence ?? 0) < 75).length;
  const runValidated = runs.some(r => r.status === 'validated');

  if (payslipsDraft > 0) {
    checks.push({
      id: 'payroll-not-validated',
      category: 'payroll',
      severity: 'critical',
      title: 'Bulletins de paie non validés',
      description: `${payslipsDraft} bulletin(s) en brouillon`,
      blocking: true,
    });
  }

  if (payrollAnomalies > 0) {
    checks.push({
      id: 'payroll-anomalies',
      category: 'payroll',
      severity: 'warning',
      title: 'Anomalies paie détectées',
      description: `${payrollAnomalies} bulletin(s) — employé non trouvé ou CNSS manquant`,
      blocking: payrollAnomalies > 2,
    });
  }

  const cnssMissing = fiscalPayslips.filter(p => !p.cnss_number && !p.cnss_amount).length;
  if (cnssMissing > 0) {
    checks.push({
      id: 'cnss-missing',
      category: 'payroll',
      severity: 'critical',
      title: 'CNSS manquant avant clôture',
      description: `${cnssMissing} bulletin(s) sans données CNSS`,
      blocking: true,
    });
  }

  const payroll: LiasseFiscalePayload['payroll'] = {
    gross_salaries: round(grossSalaries),
    net_salaries: round(netSalaries),
    cnss_deductions: round(cnssDed),
    ir_retained: round(irRet),
    employees_count: fiscalPayslips.length || (salaries?.length ?? 0),
    payslips_validated: payslipsValidated,
    payslips_draft: payslipsDraft,
    payroll_anomalies: payrollAnomalies,
    payroll_run_validated: runValidated,
  };

  // ── TVA ─────────────────────────────────────────────────────────────────────
  const { data: salesInv } = await db
    .from('atlas_invoices')
    .select('vat_amount, amount_ht, vat_rate, validation_status')
    .eq('user_id', userId);

  const { data: purchaseInv } = await db
    .from('atlas_supplier_invoices')
    .select('vat_amount, amount_ht, validation_status')
    .eq('user_id', userId);

  let tvaCollected = 0;
  let tvaDeductible = 0;
  let tvaInconsistencies = 0;

  for (const inv of salesInv ?? []) {
    tvaCollected += Number(inv.vat_amount ?? 0);
    const ht = Number(inv.amount_ht ?? 0);
    const rate = Number(inv.vat_rate ?? 20);
    const expected = ht * (rate / 100);
    const detected = Number(inv.vat_amount ?? 0);
    if (ht > 0 && Math.abs(expected - detected) / ht > 0.05) tvaInconsistencies++;
  }

  for (const inv of purchaseInv ?? []) {
    tvaDeductible += Number(inv.vat_amount ?? 0);
  }

  if (tvaInconsistencies > 0) {
    checks.push({
      id: 'tva-inconsistency',
      category: 'tva',
      severity: 'critical',
      title: 'Incohérences TVA avant clôture',
      description: `${tvaInconsistencies} facture(s) avec écart HT × taux vs TVA`,
      blocking: true,
    });
  }

  // ── Invoices validation ─────────────────────────────────────────────────────
  const allInvoices = [...(salesInv ?? []), ...(purchaseInv ?? [])];
  const validatedCount = allInvoices.filter(i => i.validation_status === 'validated').length;
  const invoicesValidatedPct = allInvoices.length
    ? Math.round((validatedCount / allInvoices.length) * 100)
    : 100;

  // ── Legal expired ───────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const { count: expiredLegal } = await db
    .from('zafirix_legal_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lt('expiry_date', today);

  if ((expiredLegal ?? 0) > 0) {
    checks.push({
      id: 'legal-expired',
      category: 'legal',
      severity: 'warning',
      title: 'Contrats expirés',
      description: `${expiredLegal} contrat(s) juridique(s) expiré(s)`,
      blocking: false,
    });
  }

  // ── Readiness score ─────────────────────────────────────────────────────────
  const bankReconciledPct = txList.length
    ? Math.round(((txList.length - unreconciledCount) / txList.length) * 100)
    : 100;

  const factors: LiasseReadinessFactors = {
    accounting_balanced: bilan.balanced,
    invoices_validated_pct: invoicesValidatedPct,
    tva_consistent: tvaInconsistencies === 0,
    bank_reconciled_pct: bankReconciledPct,
    payroll_validated: payslipsDraft === 0 && payrollAnomalies <= 2,
    no_critical_alerts: !checks.some(c => c.severity === 'critical'),
    legal_not_expired: (expiredLegal ?? 0) === 0,
    liasse_generated: true,
  };

  const weights = [
    factors.accounting_balanced ? 20 : 0,
    Math.min(15, Math.round(factors.invoices_validated_pct * 0.15)),
    factors.tva_consistent ? 15 : 0,
    Math.min(20, Math.round(factors.bank_reconciled_pct * 0.2)),
    factors.payroll_validated ? 15 : 0,
    factors.no_critical_alerts ? 10 : 0,
    factors.legal_not_expired ? 5 : 0,
  ];
  const readiness_score = Math.min(100, weights.reduce((a, b) => a + b, 0));

  return {
    fiscal_year: fiscalYear,
    company_name: companyName,
    generated_at: new Date().toISOString(),
    bank,
    payroll,
    accounting: {
      total_debit: totalDebit,
      total_credit: totalCredit,
      bilan_actif: bilan.actif,
      bilan_passif: bilan.passif,
      bilan_balanced: bilan.balanced,
    },
    tva: {
      collected: round(tvaCollected),
      deductible: round(tvaDeductible),
      inconsistencies: tvaInconsistencies,
    },
    checks,
    readiness_score,
    readiness_factors: factors,
  };
}

export function getBlockingIssues(checks: LiasseCheck[]): LiasseCheck[] {
  return checks.filter(c => c.blocking);
}

export function canValidateOrFile(
  checks: LiasseCheck[],
  overrideReason?: string | null,
): { allowed: boolean; blockers: LiasseCheck[]; message?: string } {
  const blockers = getBlockingIssues(checks);
  if (blockers.length === 0) return { allowed: true, blockers: [] };
  if (overrideReason && overrideReason.trim().length >= 10) {
    return { allowed: true, blockers, message: 'Dérogation administrateur appliquée' };
  }
  return {
    allowed: false,
    blockers,
    message: `${blockers.length} point(s) bloquant(s). Dérogation admin requise (min. 10 caractères).`,
  };
}

export async function buildAuditPackage(
  db: SupabaseClient,
  payload: LiasseFiscalePayload,
  input: LiasseEngineInput & { status: string },
): Promise<LiasseAuditPackage> {
  const { userId, companyId, fiscalYear } = input;
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31`;

  const { data: unreconciledTx } = await db
    .from('zafirix_bank_transactions')
    .select('id, transaction_date, description, amount')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .gte('transaction_date', yearStart)
    .lte('transaction_date', yearEnd)
    .limit(200);

  const txIds = (unreconciledTx ?? []).map(t => String(t.id));
  const { data: recons } = txIds.length
    ? await db.from('atlas_bank_reconciliation').select('transaction_id, status').in('transaction_id', txIds)
    : { data: [] };

  const unmatchedIds = new Set(
    (recons ?? [])
      .filter(r => r.status === 'unmatched' || r.status === 'suggested')
      .map(r => String(r.transaction_id)),
  );

  const unreconciled = (unreconciledTx ?? [])
    .filter(t => unmatchedIds.has(String(t.id)) || !(recons ?? []).some(r => String(r.transaction_id) === String(t.id)))
    .slice(0, 50)
    .map(t => ({
      id: String(t.id),
      date: t.transaction_date as string | null,
      description: t.description as string | null,
      amount: Number(t.amount ?? 0),
    }));

  const { data: auditLogs } = await db
    .from('atlas_audit_logs')
    .select('action, entity_type, created_at')
    .eq('performed_by', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  const { count: docCount } = await db
    .from('atlas_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('company_id', companyId);

  return {
    exported_at: new Date().toISOString(),
    fiscal_year: fiscalYear,
    company_name: payload.company_name,
    readiness_score: payload.readiness_score,
    status: input.status as LiasseAuditPackage['status'],
    bank_reconciliation_summary: payload.bank,
    unreconciled_transactions: unreconciled,
    payroll_summary: payload.payroll,
    cnss_summary: {
      total_cnss: payload.payroll.cnss_deductions,
      pending: payload.payroll.payslips_draft,
    },
    ir_summary: { retained_ir: payload.payroll.ir_retained },
    validation_alerts: payload.checks,
    audit_logs_sample: (auditLogs ?? []).map(l => ({
      action: String(l.action),
      entity_type: String(l.entity_type),
      created_at: String(l.created_at),
    })),
    source_documents_count: docCount ?? 0,
  };
}

export async function upsertLiasseRecord(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
  payload: LiasseFiscalePayload,
): Promise<string> {
  const blockers = getBlockingIssues(payload.checks);
  const { data, error } = await db
    .from('zafirix_liasse_fiscale')
    .upsert({
      user_id: userId,
      company_id: companyId,
      fiscal_year: fiscalYear,
      status: 'draft',
      readiness_score: payload.readiness_score,
      payload: payload as unknown as Record<string, unknown>,
      validation_result: { checks: payload.checks, factors: payload.readiness_factors } as unknown as Record<string, unknown>,
      blocking_issues: blockers as unknown as Record<string, unknown>[],
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,company_id,fiscal_year' })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return String(data?.id);
}
