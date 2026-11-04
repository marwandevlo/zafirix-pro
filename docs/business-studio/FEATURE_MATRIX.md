# Business Studio — feature completion matrix

Branch `feature/business-studio`, based on production `4fe5012`. Engine `studio-engine-1.0.0`, tax rules `ma-studio-rules-2026.11-v1`.

Status meanings:
- **Done**: implemented and verified by the evidence listed.
- **Partial**: works as described, with the gap stated.
- **Not done**: not implemented.

Evidence types:
- **U**: unit test in `tests/business-studio/*.test.ts`.
- **I**: integration test against local Postgres + PostgREST (`tests/business-studio/integration`).
- **H**: HTTP smoke through `next start` (`tests/business-studio/e2e/http-smoke.mjs`).
- **B**: manual browser run on a local production build.

None of this evidence comes from hosted Supabase or production.

| # | Feature | Status | What exists | Evidence | Gap |
|---|---|---|---|---|---|
| 1 | Study management | Partial | Create, edit, autosave with revision check (409 on conflict), duplicate, archive/restore, versions (create, compare with current, restore), statuses draft → under review → approved (locked) → reopen, 16 sector templates, legacy import (copy; original untouched), audit trail in the study | U, I, H, B | Owner-only access: no sharing with other company members (needs a schema change). No role separation for approval. No side-by-side comparison of two different studies (versions and scenarios can be compared). |
| 2 | Shared engine + sector modules | Done | One engine; 16 sector modules add templates and sector KPIs | U ("every sector template validates…", "sector KPI uses the sector input") | — |
| 3 | Company / director / shareholder profile | Done | Logo (PNG/JPEG only, 300 KB maximum), ICE (15 digits), RC, IF, CNSS (all optional), directors, shareholders; optional link to an existing company | U (logo), B | No personal identity data is collected, by design |
| 4 | Horizon 1–30 years; monthly / quarterly / annual | Done | Monthly engine; aggregation by quarter and fiscal year; partial years marked | U ("reconciles exactly for every horizon 1..30", "aggregation…") | — |
| 5 | Revenue | Done | Products/services with volume, price, growth, seasonality, VAT rate, payment terms | U, B | — |
| 6 | Expenses | Done | Fixed/variable lines, payroll with CNSS/AMO/TFP and IR, consumed purchases (raw materials) separated from external charges | U (payroll worked example, raw materials) | — |
| 7 | Investments & financing | Done | Assets with straight-line or declining depreciation (prorata temporis), loans with grace (paid or capitalised), equity, grants, overdraft | U | — |
| 8 | Integrated statements & metrics | Done | P&L, balance sheet, cash flow in integer centimes; balance check every month; NPV, IRR, payback, break-even, DSCR; null with a reason instead of NaN | U (400 random studies reconcile, IRR/NPV oracles) | — |
| 9 | Moroccan fiscal engine | Partial | IS 2023–2025 and 2026, CM and its exemption, loss carry-forward, instalments, VAT by date with cash/debit basis and credit carry-forward, IR scale, CNSS, AMO; 23 rules, each with a status and a source; VAT never charged to the P&L when deductible | U (tax suite), B | Nothing reviewed by an expert-comptable. TFP, CM exemption, payroll IR monthly convention and VAT payment month are tool conventions. TP, TSC, registration duties and dividend withholding are user-entered. Other withholding taxes, the VAT credit refund (art. 103 bis) and IS before 2023 are not covered. |
| 10 | Dashboard | Done | KPIs and charts drawn only from engine series (18 charts on the test study) | U ("charts carry engine series only"), B | — |
| 11 | Simulator | Done | Levers on price, volume, unit costs, operating charges, interest rate, customer payment delay, launch delay and IS rate override; save as scenario reproduces figures exactly | U, B | — |
| 12 | Scenarios, sensitivity, stress, SWOT, PESTEL, risks | Done | Default and custom scenarios, tornado, 5×5 matrix, 7 stress tests, SWOT/PESTEL/risk register (user content) | U, B | No market statistics are supplied by the tool, by design |
| 13 | Forecast vs actual (read-only) | Done | Reads validated entries of the linked company only, CGNC class mapping, variance | U, I ("actuals are read-only and company-scoped"), H | — |
| 14 | Interactive tables, FR/AR | Partial | All screens in French and Arabic with RTL | U ("every workspace screen renders in French and Arabic"), B | Arabic not proofread by a native reviewer. Findings, rule labels and default scenario names stay French. |
| 15 | Seven reports, PDF and Excel, FR/AR | Done | Full, bank, investor, financials, tax, scenarios, actuals; Arabic PDF with embedded Amiri font (OFL) | U (every type, both languages, values reconcile), B (28 files) | Same Arabic proofreading caveat as #14 |
| 16 | Traced analysis | Done | Every finding is typed (calculated or assumption) and links to the series and period it comes from | U ("findings are traceable and typed") | — |
| 17 | Premium UX | Partial | Workspace with tabs, autosave state, lock state, mobile layout at 390 px without overflow | B | No formal accessibility audit |
| 18 | Security | Done (local) | Bearer auth on every route; every query filtered by `user_id`; company access checked through the existing `canAccessCompany`; server-side validation of every model (422); actuals read-only; no write to accounting tables | I, H | Not verified on hosted Supabase. No RLS change was made or is needed. |
| 19 | Tests | Done | 63 unit/UI tests, 7 integration tests, 8 HTTP smoke checks, browser run | See results | — |
| 20 | Release artefacts | Done | This matrix, `RELEASE_PLAN.md`, `scripts/business-studio-preflight.mjs`, logical commits pushed to the private backup only | — | Deployment itself awaits approval |
