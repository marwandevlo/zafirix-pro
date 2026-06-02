export type LiasseStatus = 'draft' | 'validated' | 'filed';

export type LiasseCheckSeverity = 'critical' | 'warning' | 'info';

export type LiasseCheck = {
  id: string;
  category: 'bank' | 'payroll' | 'tva' | 'accounting' | 'legal' | 'invoices' | 'liasse';
  severity: LiasseCheckSeverity;
  title: string;
  description: string;
  blocking: boolean;
};

export type LiasseBankSummary = {
  accounting_bank_balance: number;
  statement_closing_balance: number | null;
  closing_balance_mismatch: boolean;
  transactions_imported: number;
  reconciled_amount: number;
  unreconciled_amount: number;
  unreconciled_count: number;
  payments_without_entries: number;
  paid_invoices_no_bank_match: number;
};

export type LiassePayrollSummary = {
  gross_salaries: number;
  net_salaries: number;
  cnss_deductions: number;
  ir_retained: number;
  employees_count: number;
  payslips_validated: number;
  payslips_draft: number;
  payroll_anomalies: number;
  payroll_run_validated: boolean;
};

export type LiasseReadinessFactors = {
  accounting_balanced: boolean;
  invoices_validated_pct: number;
  tva_consistent: boolean;
  bank_reconciled_pct: number;
  payroll_validated: boolean;
  no_critical_alerts: boolean;
  legal_not_expired: boolean;
  liasse_generated: boolean;
};

export type LiasseFiscalePayload = {
  fiscal_year: number;
  company_name: string;
  generated_at: string;
  bank: LiasseBankSummary;
  payroll: LiassePayrollSummary;
  accounting: {
    total_debit: number;
    total_credit: number;
    bilan_actif: number;
    bilan_passif: number;
    bilan_balanced: boolean;
  };
  tva: {
    collected: number;
    deductible: number;
    inconsistencies: number;
  };
  checks: LiasseCheck[];
  readiness_score: number;
  readiness_factors: LiasseReadinessFactors;
};

export type LiasseAuditPackage = {
  exported_at: string;
  fiscal_year: number;
  company_name: string;
  readiness_score: number;
  status: string;
  bank_reconciliation_summary: LiasseBankSummary;
  unreconciled_transactions: { id: string; date: string | null; description: string | null; amount: number }[];
  payroll_summary: LiassePayrollSummary;
  cnss_summary: { total_cnss: number; pending: number };
  ir_summary: { retained_ir: number };
  validation_alerts: LiasseCheck[];
  audit_logs_sample: { action: string; entity_type: string; created_at: string }[];
  source_documents_count: number;
};
