# FAKE REMOVAL PLAN — ZAFIRIX PRO

Phased plan after enforcement pass (2026-05-28). Items marked **DONE** were addressed in this pass.

---

## Phase 0 — DONE (this pass)

| Item | Action | Status |
|------|--------|--------|
| Comptabilité hardcoded journal | Wire `upsertAtlasAccountingEntry` + remove 6 demo lines | **DONE** |
| Clients seed | Remove `seedClients` | **DONE** |
| Factures seed | Remove 3 demo invoices | **DONE** |
| Companies seed | Remove `defaultCompanies` | **DONE** |
| IR seed employees | Start with empty array | **DONE** |
| Production guard framework | `isDemoFeatureBlocked` + `ProductionBlockedSurface` | **DONE** |
| Block `/tva`, `/rapports`, `/agents`, `/etude-projet` in prod | Route guards | **DONE** |
| Client portal default-off | `isClientPortalDemoEnabled()` requires explicit env | **DONE** |
| BetaSurfaceBadge copy | → "Fonctionnalité en cours de stabilisation" | **DONE** |
| Dashboard misleading TVA/simulation copy | Updated KPI + banner | **DONE** |
| Comptabilité "Brouillon non audité" | Removed where real KPIs shown | **DONE** |

---

## Phase 1 — TVA real (priority: high)

**Goal:** TVA from real invoices + supplier invoices, not in-memory demo.

1. Create `atlas-tva-repository.ts` aggregating:
   - Sales: `atlas_invoices` (HT, VAT by period)
   - Purchases: `atlas_supplier_invoices`
2. Replace `/tva` in-memory state with loaded rows
3. Remove `tva_simulation` production block when data source is real
4. XML export from computed totals (still not DGI submit — label clearly)

**Acceptance:** Production `/tva` shows only user's stored invoices; zero hardcoded rows.

---

## Phase 2 — Rapports real (priority: high)

**Goal:** PDF reports generated from stored fiscal aggregates.

1. Shared report data service (reuse TVA + payroll aggregates)
2. Replace static jsPDF bodies in `rapports/page.tsx`
3. Remove `reports_static_pdf` block when service returns real data

**Acceptance:** PDF amounts match Supabase invoice totals for test tenant.

---

## Phase 3 — Agents real (priority: medium)

**Goal:** Agent cards reflect job history, not fake stats.

1. `atlas_agent_jobs` table (type, status, result_ref, created_at)
2. Wire OCR/TVA/payment webhooks to enqueue jobs
3. UI reads job counts from DB

**Acceptance:** New user sees zero completed jobs, not "12 done".

---

## Phase 4 — Client portal (priority: medium)

**Goal:** Authenticated client access to their invoices only.

1. Client role in Supabase + RLS by `client_id`
2. Magic link or invite flow (no PIN 1234)
3. Delete `ClientPortalDemo.tsx` after real portal ships

**Acceptance:** `/client` works without demo env flag.

---

## Phase 5 — Étude de projet (priority: low)

**Goal:** Persist feasibility studies per user/company.

1. Store wizard answers + generated study in `atlas_projects` or new table
2. Optional AI generation via `/api/ai` with auth
3. Remove `etude_projet_wizard` block

---

## Phase 6 — Grand-livre & Bilan (priority: low)

**Goal:** Accounting views beyond flat journal.

1. Chart of accounts mapping on `atlas_accounting_entries`
2. GL aggregation queries
3. Bilan from mapped balances

---

## Phase 7 — Fiscal calendar (priority: low)

**Goal:** Dashboard deadlines from company regime + stored declarations.

1. Derive TVA regime from active company (`regimeTVA`)
2. Replace static `deadlines` array in `app/page.tsx`

---

## Do not regress

- Documents OCR multi-page + multi-invoice
- Supplier invoice creation from OCR
- `atlas_payments` integration on factures
- Comptabilité supplier KPI section
- Production localStorage block
- Supabase-only backend in production

---

## Files changed (enforcement pass)

| File | Change |
|------|--------|
| `app/lib/atlas-runtime-guards.ts` | Demo feature blocking |
| `app/components/safety/ProductionBlockedSurface.tsx` | New blocked UI |
| `app/components/safety/BetaSurfaceBadge.tsx` | Stabilization copy |
| `app/lib/atlas-sprint0-flags.ts` | Client portal opt-in only |
| `app/lib/atlas-accounting-repository.ts` | `upsertAtlasAccountingEntry` |
| `app/comptabilite/page.tsx` | Real journal + banner cleanup |
| `app/clients/page.tsx` | No seed |
| `app/factures/page.tsx` | No seed |
| `app/companies/page.tsx` | No seed |
| `app/tva/page.tsx` | Prod block + empty start |
| `app/rapports/page.tsx` | Prod block |
| `app/agents/page.tsx` | Prod block |
| `app/etude-projet/page.tsx` | Prod block |
| `app/ir/page.tsx` | No seed employees |
| `app/page.tsx` | Dashboard copy + formatMadAmountLabel |
| `app/client/page.tsx` | Copy update |
