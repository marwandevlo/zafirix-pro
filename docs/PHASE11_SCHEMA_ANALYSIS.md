# Phase 11 — Schema Analysis Report (Feature 9)

## Existing Payroll Schema

### `atlas_employees`
- **PK:** `id` (uuid)
- **Links:** `user_id`, `company_id`
- **Identity:** `full_name`, `cin`, `cnss_matricule`, `gross_salary_mad`
- **Used for:** manual RH CRUD + payroll run salary lines

### `atlas_payroll_runs`
- **PK:** `id`
- **Unique:** `(company_id, period_year, period_month)`
- **Status:** `draft` | `validated`
- **Totals:** `total_gross`, `total_cnss_employee`, `total_amo_employee`, `total_ir`, `total_net`
- **Child:** `atlas_salaries` (one row per employee per run)

### `atlas_salaries`
- **FK:** `payroll_run_id` → `atlas_payroll_runs`
- **FK:** `employee_id` → `atlas_employees`
- **Amounts:** gross, CNSS, AMO, IR, net, employer contributions

### `atlas_ir_snapshots`
- **FK:** `payroll_run_id` (optional)
- **Period:** `period_year`, `period_month`
- **Totals:** IR, gross, employee_count

### CNSS / IR
- No separate declaration tables
- CNSS/IR computed via `atlas-payroll-calculations.ts` (Morocco 2026 formulas)
- IR page (`/ir`) reads snapshots API

## Relationships Map

```
atlas_documents (payroll_slip OCR)
    └── atlas_payslip_extractions [NEW Phase 11]
            ├── employee_id → atlas_employees
            ├── payroll_run_id → atlas_payroll_runs
            └── salary_id → atlas_salaries

atlas_documents (bank_statement OCR)
    └── zafirix_bank_statements [NEW]
            └── zafirix_bank_transactions [NEW]
                    └── atlas_bank_reconciliation [NEW]
                            ├── entity: atlas_invoices (sales)
                            └── entity: atlas_supplier_invoices (purchases)
```

## Pre-Phase 11 Gaps (Resolved in Phase 11)

| Gap | Resolution |
|-----|------------|
| Bank routing stub only | `routeBankStatement` → real statement + transactions |
| Payroll routing stub only | `routePayrollSlip` → `atlas_payslip_extractions` + optional salary link |
| No reconciliation | `atlas-bank-reconciliation.ts` engine |
| Validation cascade missing bank/payroll | Added to `validation/records` cascade map |
| No `/banque` page | `app/banque/page.tsx` |

## Implementation Decisions

1. **Confidence threshold:** 75% for auto-link employee; below → `draft` review queue
2. **Reconciliation:** amount exact match ±0.01 MAD; date tolerance 7 days; name similarity ≥60%
3. **Payroll run:** payslip links to existing run for period if exists; does not auto-validate run
