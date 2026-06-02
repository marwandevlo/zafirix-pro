/**
 * Phase 11 Verification — Banking Automation & Payroll Engine
 * 150+ structural checks (no network)
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
let pass = 0, fail = 0;

function check(label, result) {
  if (result) { console.log(`  ✓ PASS  ${label}`); pass++; }
  else { console.error(`  ✗ FAIL  ${label}`); fail++; }
}
function has(file, text) {
  try { return readFileSync(path.join(ROOT, file), 'utf8').includes(text); }
  catch { return false; }
}
function exists(file) { return existsSync(path.join(ROOT, file)); }

// ── 1. Migration ─────────────────────────────────────────────────────────────
console.log('\n[1] Migration phase11_banking_payroll.sql');
check('migration exists', exists('supabase/migrations/20260602060000_phase11_banking_payroll.sql'));
check('zafirix_bank_statements table', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'zafirix_bank_statements'));
check('zafirix_bank_transactions table', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'zafirix_bank_transactions'));
check('transaction_date index', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'idx_bank_tx_date'));
check('source_document_id index', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'idx_bank_tx_source_doc'));
check('account_number index', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'idx_bank_tx_account'));
check('atlas_bank_reconciliation table', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'atlas_bank_reconciliation'));
check('reconciliation status check', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', "'matched','suggested','unmatched'"));
check('atlas_payslip_extractions table', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'atlas_payslip_extractions'));
check('payslip validation_status', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'validation_status'));
check('confidence_score on transactions', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'confidence_score'));
check('statement_id FK', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'statement_id'));
check('employee_id FK payslip', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'references public.atlas_employees'));
check('payroll_run_id FK', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'atlas_payroll_runs'));
check('RLS enabled bank', has('supabase/migrations/20260602060000_phase11_banking_payroll.sql', 'enable row level security'));

// ── 2. Schema analysis doc ───────────────────────────────────────────────────
console.log('\n[2] Schema analysis (Feature 9)');
check('PHASE11_SCHEMA_ANALYSIS.md exists', exists('docs/PHASE11_SCHEMA_ANALYSIS.md'));
check('documents atlas_employees mapping', has('docs/PHASE11_SCHEMA_ANALYSIS.md', 'atlas_employees'));
check('atlas_payroll_runs documented', has('docs/PHASE11_SCHEMA_ANALYSIS.md', 'atlas_payroll_runs'));
check('confidence threshold documented', has('docs/PHASE11_SCHEMA_ANALYSIS.md', '75%'));

// ── 3. Types ─────────────────────────────────────────────────────────────────
console.log('\n[3] TypeScript types');
check('atlas-bank.ts exists', exists('app/types/atlas-bank.ts'));
check('BankTransaction type', has('app/types/atlas-bank.ts', 'export type BankTransaction'));
check('BankReconciliation type', has('app/types/atlas-bank.ts', 'ReconciliationStatus'));
check('BankDashboardKpis', has('app/types/atlas-bank.ts', 'BankDashboardKpis'));
check('AtlasPayslipExtraction', has('app/types/atlas-payroll.ts', 'AtlasPayslipExtraction'));
check('PayslipValidationStatus', has('app/types/atlas-payroll.ts', 'PayslipValidationStatus'));

// ── 4. Bank extraction lib ───────────────────────────────────────────────────
console.log('\n[4] Bank extraction library');
check('atlas-bank-extraction.ts', exists('app/lib/atlas-bank-extraction.ts'));
check('parseBankTransactionsFromDocument', has('app/lib/atlas-bank-extraction.ts', 'parseBankTransactionsFromDocument'));
check('normalizeTransaction', has('app/lib/atlas-bank-extraction.ts', 'normalizeTransaction'));
check('statementHeaderFromExtraction', has('app/lib/atlas-bank-extraction.ts', 'statementHeaderFromExtraction'));
check('metadata.transactions support', has('app/lib/atlas-bank-extraction.ts', 'metadata?.transactions'));

// ── 5. Bank server ───────────────────────────────────────────────────────────
console.log('\n[5] Bank server');
check('atlas-bank-server.ts', exists('app/lib/atlas-bank-server.ts'));
check('createBankStatementFromDocument', has('app/lib/atlas-bank-server.ts', 'createBankStatementFromDocument'));
check('logAuditEvent on create', has('app/lib/atlas-bank-server.ts', 'logAuditEvent'));
check('runs reconciliation', has('app/lib/atlas-bank-server.ts', 'runReconciliationForTransactions'));

// ── 6. Reconciliation engine ─────────────────────────────────────────────────
console.log('\n[6] Reconciliation engine');
check('atlas-bank-reconciliation.ts', exists('app/lib/atlas-bank-reconciliation.ts'));
check('findMatchesForTransaction', has('app/lib/atlas-bank-reconciliation.ts', 'findMatchesForTransaction'));
check('sales_invoice matching', has('app/lib/atlas-bank-reconciliation.ts', 'sales_invoice'));
check('supplier_invoice matching', has('app/lib/atlas-bank-reconciliation.ts', 'supplier_invoice'));
check('nameSimilarity', has('app/lib/atlas-bank-reconciliation.ts', 'nameSimilarity'));
check('DATE_TOLERANCE_DAYS', has('app/lib/atlas-bank-reconciliation.ts', 'DATE_TOLERANCE_DAYS'));
check('confidence >= 85 matched', has('app/lib/atlas-bank-reconciliation.ts', '>= 85'));
check('runReconciliationForTransactions', has('app/lib/atlas-bank-reconciliation.ts', 'runReconciliationForTransactions'));

// ── 7. Payslip server ────────────────────────────────────────────────────────
console.log('\n[7] Payslip / payroll server');
check('atlas-payslip-server.ts', exists('app/lib/atlas-payslip-server.ts'));
check('createPayslipExtractionFromDocument', has('app/lib/atlas-payslip-server.ts', 'createPayslipExtractionFromDocument'));
check('matchEmployee', has('app/lib/atlas-payslip-server.ts', 'matchEmployee'));
check('AUTO_MATCH_THRESHOLD', has('app/lib/atlas-payslip-server.ts', 'AUTO_MATCH_THRESHOLD'));
check('atlas_payslip_extractions insert', has('app/lib/atlas-payslip-server.ts', 'atlas_payslip_extractions'));
check('links payroll run', has('app/lib/atlas-payslip-server.ts', 'payroll_run_id'));
check('audit log created', has('app/lib/atlas-payslip-server.ts', "action: 'created'"));
check('audit log reviewed', has('app/lib/atlas-payslip-server.ts', "action: 'reviewed'"));

// ── 8. Route-to integration ──────────────────────────────────────────────────
console.log('\n[8] Route-to (real bank + payroll)');
check('imports createBankStatementFromDocument', has('app/api/documents/[id]/route-to/route.ts', 'createBankStatementFromDocument'));
check('imports createPayslipExtractionFromDocument', has('app/api/documents/[id]/route-to/route.ts', 'createPayslipExtractionFromDocument'));
check('statementId in result', has('app/api/documents/[id]/route-to/route.ts', 'statementId: r.statementId'));
check('transactionCount', has('app/api/documents/[id]/route-to/route.ts', 'transactionCount'));
check('extractionId payroll', has('app/api/documents/[id]/route-to/route.ts', 'extractionId: r.extractionId'));
check('target_entity_id bank', has('app/api/documents/[id]/route-to/route.ts', 'targetEntityId: r.statementId'));
check('logAuditEvent bank', has('app/api/documents/[id]/route-to/route.ts', "entityType: 'bank_statement'"));
check('logAuditEvent payroll', has('app/api/documents/[id]/route-to/route.ts', "entityType: 'payroll_record'"));

// ── 9. Validation cascade ────────────────────────────────────────────────────
console.log('\n[9] Validation cascade');
check('bank_statement in cascade', has('app/api/validation/records/route.ts', 'bank_statement: \'zafirix_bank_statements\''));
check('payroll_record in cascade', has('app/api/validation/records/route.ts', 'payroll_record: \'atlas_payslip_extractions\''));

// ── 10. Bank APIs ────────────────────────────────────────────────────────────
console.log('\n[10] Bank APIs');
check('/api/bank/transactions', exists('app/api/bank/transactions/route.ts'));
check('transactions GET', has('app/api/bank/transactions/route.ts', 'export async function GET'));
check('transactions search filter', has('app/api/bank/transactions/route.ts', 'search'));
check('reconciliation enrichment', has('app/api/bank/transactions/route.ts', 'atlas_bank_reconciliation'));
check('/api/bank/reconciliation', exists('app/api/bank/reconciliation/route.ts'));
check('reconciliation GET summary', has('app/api/bank/reconciliation/route.ts', 'summary'));
check('reconciliation PATCH validate', has('app/api/bank/reconciliation/route.ts', 'validate'));
check('reconciliation rerun', has('app/api/bank/reconciliation/route.ts', 'rerun'));
check('/api/bank/alerts', exists('app/api/bank/alerts/route.ts'));
check('duplicate payment alert', has('app/api/bank/alerts/route.ts', 'Paiement en double'));
check('negative balance alert', has('app/api/bank/alerts/route.ts', 'Solde négatif'));
check('large payment alert', has('app/api/bank/alerts/route.ts', 'Montant élevé'));
check('/api/bank/dashboard', exists('app/api/bank/dashboard/route.ts'));
check('bank dashboard kpis', has('app/api/bank/dashboard/route.ts', 'transactions_imported'));

// ── 11. Payroll APIs ─────────────────────────────────────────────────────────
console.log('\n[11] Payroll APIs');
check('/api/payroll/payslips', exists('app/api/payroll/payslips/route.ts'));
check('payslips GET', has('app/api/payroll/payslips/route.ts', 'export async function GET'));
check('payslips PATCH review', has('app/api/payroll/payslips/route.ts', 'review'));
check('payslips audit log', has('app/api/payroll/payslips/route.ts', 'logAuditEvent'));
check('/api/payroll/dashboard', exists('app/api/payroll/dashboard/route.ts'));
check('CNSS summary', has('app/api/payroll/dashboard/route.ts', 'cnss'));
check('IR summary', has('app/api/payroll/dashboard/route.ts', 'retained_ir'));
check('/api/payroll/alerts', exists('app/api/payroll/alerts/route.ts'));
check('duplicate payslip alert', has('app/api/payroll/alerts/route.ts', 'Bulletin en double'));
check('missing CNSS alert', has('app/api/payroll/alerts/route.ts', 'CNSS manquant'));
check('employee not found alert', has('app/api/payroll/alerts/route.ts', 'Employé non trouvé'));
check('salary variation alert', has('app/api/payroll/alerts/route.ts', 'Variation salariale'));

// ── 12. Banque page ──────────────────────────────────────────────────────────
console.log('\n[12] /banque page');
check('banque page exists', exists('app/banque/page.tsx'));
check('Transactions table headers', has('app/banque/page.tsx', 'Débit') && has('app/banque/page.tsx', 'Crédit'));
check('ExportMenu on banque', has('app/banque/page.tsx', 'ExportMenu'));
check('ReconciliationWidget', has('app/banque/page.tsx', 'ReconciliationWidget'));
check('BankAlertCenter', has('app/banque/page.tsx', 'BankAlertCenter'));
check('search filter', has('app/banque/page.tsx', 'search'));
check('recon filter', has('app/banque/page.tsx', 'reconFilter'));
check('ValidationStatusBadge', has('app/banque/page.tsx', 'ValidationStatusBadge'));

// ── 13. Bank components ──────────────────────────────────────────────────────
console.log('\n[13] Bank components');
check('ReconciliationWidget.tsx', exists('app/components/bank/ReconciliationWidget.tsx'));
check('Rapprochement bancaire title', has('app/components/bank/ReconciliationWidget.tsx', 'Rapprochement bancaire'));
check('matched/suggested/unmatched', has('app/components/bank/ReconciliationWidget.tsx', 'Rapprochés'));
check('BankAlertCenter.tsx', exists('app/components/bank/BankAlertCenter.tsx'));
check('compact mode', has('app/components/bank/BankAlertCenter.tsx', 'compact'));

// ── 14. Payroll RH panel ─────────────────────────────────────────────────────
console.log('\n[14] RH Payroll panel');
check('RhPayrollPanel.tsx', exists('app/rh/RhPayrollPanel.tsx'));
check('CNSS tab', has('app/rh/RhPayrollPanel.tsx', 'cnss'));
check('IR tab', has('app/rh/RhPayrollPanel.tsx', 'ir'));
check('bulletins tab', has('app/rh/RhPayrollPanel.tsx', 'bulletins'));
check('ExportMenu payslips', has('app/rh/RhPayrollPanel.tsx', 'ExportMenu'));
check('patch validate payslips', has('app/rh/RhPayrollPanel.tsx', 'validate'));
check('rh paie view', has('app/rh/page.tsx', "'paie'"));
check('RhPayrollPanel import', has('app/rh/page.tsx', 'RhPayrollPanel'));

// ── 15. Payroll dashboard component ──────────────────────────────────────────
console.log('\n[15] Payroll dashboard');
check('PayrollDashboardSection', exists('app/components/payroll/PayrollDashboardSection.tsx'));
check('employees KPI', has('app/components/payroll/PayrollDashboardSection.tsx', 'Employés'));
check('CNSS KPI', has('app/components/payroll/PayrollDashboardSection.tsx', 'CNSS'));
check('IR KPI', has('app/components/payroll/PayrollDashboardSection.tsx', 'IR retenu'));

// ── 16. Main dashboard integration (Feature 18) ──────────────────────────────
console.log('\n[16] Main dashboard integration');
check('ReconciliationWidget on home', has('app/page.tsx', 'ReconciliationWidget'));
check('BankAlertCenter on home', has('app/page.tsx', 'BankAlertCenter'));
check('PayrollDashboardSection on home', has('app/page.tsx', 'PayrollDashboardSection'));
check('dashboard kpis bank_transactions', has('app/api/dashboard/kpis/route.ts', 'bank_transactions'));
check('dashboard kpis payslips', has('app/api/dashboard/kpis/route.ts', 'payslips_extracted'));
check('dashboard kpis employees', has('app/api/dashboard/kpis/route.ts', 'employees'));

// ── 17. Navigation ───────────────────────────────────────────────────────────
console.log('\n[17] Navigation');
check('banque nav item', has('app/lib/atlas-app-nav.ts', "id: 'banque'"));
check('banque href /banque', has('app/lib/atlas-app-nav.ts', "href: '/banque'"));
check('validation queue banque link', has('app/components/validation/ValidationQueueTable.tsx', "banque: '/banque'"));

// ── 18. Audit entity types ─────────────────────────────────────────────────────
console.log('\n[18] Audit traceability');
check('bank_statement entity type', has('app/lib/atlas-audit-log.ts', "'bank_statement'"));
check('bank_transaction entity type', has('app/lib/atlas-audit-log.ts', "'bank_transaction'"));

// ── 19. Export integration (Feature 19) ──────────────────────────────────────
console.log('\n[19] Export integration');
check('ExportMenu banque', has('app/banque/page.tsx', 'TX_EXPORT_COLUMNS'));
check('ExportMenu RH payroll', has('app/rh/RhPayrollPanel.tsx', 'PAYSLIP_EXPORT'));
check('source_document_id in export cols', has('app/banque/page.tsx', 'sourceDocumentId'));
check('validation_status export col banque', has('app/banque/page.tsx', 'validationStatus'));
check('ExportMenu component exists', exists('app/components/ExportMenu.tsx'));
check('atlas-table-export lib', exists('app/lib/atlas-table-export.ts'));

// ── 20. Bank transaction fields (Feature 1) ──────────────────────────────────
console.log('\n[20] Bank transaction schema fields');
const mig = 'supabase/migrations/20260602060000_phase11_banking_payroll.sql';
check('field debit', has(mig, 'debit numeric'));
check('field credit', has(mig, 'credit numeric'));
check('field value_date', has(mig, 'value_date date'));
check('field reference', has(mig, 'reference text'));
check('field raw_payload', has(mig, 'raw_payload jsonb'));
check('field match_confidence payslip', has(mig, 'match_confidence'));
check('field matricule payslip', has(mig, 'matricule text'));
check('field bonuses payslip', has(mig, 'bonuses numeric'));

// ── 21. Reconciliation statuses (Feature 4-6) ────────────────────────────────
console.log('\n[21] Reconciliation & matching');
check('entity_type on reconciliation', has(mig, 'entity_type text'));
check('confidence on reconciliation', has(mig, 'confidence numeric'));
check('atlas_invoices in matcher', has('app/lib/atlas-bank-reconciliation.ts', 'atlas_invoices'));
check('atlas_supplier_invoices in matcher', has('app/lib/atlas-bank-reconciliation.ts', 'atlas_supplier_invoices'));
check('AMOUNT_TOLERANCE', has('app/lib/atlas-bank-reconciliation.ts', 'AMOUNT_TOLERANCE'));

// ── 22. Payroll validation workflow (Feature 15) ───────────────────────────
console.log('\n[22] Payroll validation workflow');
check('draft status payslip', has(mig, "'draft','reviewed','validated','rejected'"));
check('payslips reject action', has('app/api/payroll/payslips/route.ts', 'reject'));
check('ValidationStatusBadge RH', has('app/rh/RhPayrollPanel.tsx', 'ValidationStatusBadge'));

// ── 23. Payslip extraction fields (Feature 10) ───────────────────────────────
console.log('\n[23] Payslip extraction fields');
check('gross_salary field', has(mig, 'gross_salary numeric'));
check('net_salary field', has(mig, 'net_salary numeric'));
check('cnss_amount field', has(mig, 'cnss_amount numeric'));
check('ir_amount field', has(mig, 'ir_amount numeric'));
check('cin field', has(mig, 'cin text'));
check('employee_name in server', has('app/lib/atlas-payslip-server.ts', 'employee_name'));

// ── 24. API runtime exports ──────────────────────────────────────────────────
console.log('\n[24] API runtime');
check('bank transactions force-dynamic', has('app/api/bank/transactions/route.ts', 'force-dynamic'));
check('bank reconciliation force-dynamic', has('app/api/bank/reconciliation/route.ts', 'force-dynamic'));
check('payroll dashboard force-dynamic', has('app/api/payroll/dashboard/route.ts', 'force-dynamic'));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log(`PHASE 11 VERIFICATION: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
console.log('═'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
