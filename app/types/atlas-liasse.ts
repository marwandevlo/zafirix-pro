export type LiasseStatus = 'draft' | 'validated' | 'filed';

export type LiasseCheckSeverity = 'critical' | 'warning' | 'info';

export type LiasseValidationCheck = {
  id: string;
  severity: LiasseCheckSeverity;
  category: string;
  message: string;
  blocking: boolean;
  details?: Record<string, unknown>;
};

export type LiasseBankSummary = {
  statements_count: number;
  transactions_count: number;
  reconciled_count: number;
  suggested_count: number;
  unreconciled_count: number;
  accounting_bank_balance: number;
  imported_transactions_total: number;
  last_statement_closing: number | null;
  computed_closing_from_tx: number | null;
  closing_balance_delta: number | null;
};

export type LiassePayrollSummary = {
  employees: number;
  gross_salaries: number;
  net_salaries: number;
  cnss_deductions: number;
  ir_retained: number;
  payslips_total: number;
  payslips_validated: number;
  payslips_draft: number;
  payroll_anomalies: string[];
  payroll_run_status: string | null;
};

export type LiasseFiscaleRecord = {
  id: string;
  companyId: string | null;
  fiscalYear: number;
  status: LiasseStatus;
  readinessScore: number;
  payload: Record<string, unknown>;
  validationResult: {
    checks: LiasseValidationCheck[];
    readiness_breakdown: Record<string, number>;
  };
  blockingIssues: LiasseValidationCheck[];
  adminOverrideReason: string | null;
  generatedAt: string | null;
  validatedAt: string | null;
  filedAt: string | null;
  createdAt: string;
};

export type LiasseAuditPackage = {
  exported_at: string;
  fiscal_year: number;
  company_id: string | null;
  readiness_score: number;
  status: LiasseStatus;
  bank_reconciliation_summary: LiasseBankSummary;
  unreconciled_transactions: unknown[];
  payroll_summary: LiassePayrollSummary;
  cnss_summary: Record<string, unknown>;
  ir_summary: Record<string, unknown>;
  validation_alerts: LiasseValidationCheck[];
  bilan_excerpt: Record<string, unknown>;
  audit_logs_sample: unknown[];
  source_documents: unknown[];
};
