# PRODUCTION VERIFICATION REPORT — ZAFIRIX PRO

**Date:** 2026-05-28  
**Method:** Read-only code audit + `npm run build` (production compile). Live browser E2E against Supabase **not executed** in this pass (requires manual QA with real credentials).  
**Env reviewed:** `.env.local` has `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`, Supabase URL/keys, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.

---

## Summary

| Result | Count |
|--------|-------|
| **PASS** (code path sound) | 7 |
| **PASS** (guard / enforcement) | 2 |
| **FAIL → fixed** | 3 |
| **BLOCKED** (needs live E2E / migrations / ops) | 5 |

**Build:** `npm run build` — **passed** (Next.js 16.2.3, 75 routes, TypeScript OK).

---

## Flow results

### 1. Fresh user signup / login

| Field | Value |
|-------|-------|
| **Status** | **PASS** (after fix) |
| **Files** | `app/signup/page.tsx`, `app/login/page.tsx`, `middleware.ts`, `app/api/profile/route.ts` |
| **Error (before fix)** | Company `upsertAtlasCompany` failure was silent; user redirected to onboarding with no active company |
| **Fix applied** | Show `atlasCompanyErrorMessage` and abort redirect when company upsert fails (`signup/page.tsx`) |
| **Manual E2E** | Confirm signup with instant session → company row in `atlas_companies` with `is_active=true`; email-confirmation path → login → onboarding |

---

### 2. Profile / onboarding / settings persistence

| Field | Value |
|-------|-------|
| **Status** | **PASS** (core path) |
| **Files** | `app/onboarding/page.tsx`, `app/settings/page.tsx`, `app/lib/atlas-profiles-repository.ts`, `app/api/profile/route.ts` |
| **Notes** | Settings saves profile + active company via Supabase. Onboarding `companyType` / `selectedNeeds` not persisted to DB (non-blocking). Middleware does not force `/onboarding` when incomplete. |
| **Manual E2E** | Complete onboarding → settings save → hard refresh → values persist |

---

### 3. Create company → refresh

| Field | Value |
|-------|-------|
| **Status** | **PASS** |
| **Files** | `app/companies/page.tsx`, `app/lib/atlas-companies-repository.ts` |
| **Notes** | `reloadCompanies()` after `upsertAtlasCompany`. New companies default `actif: false`; user must activate via row select (by design). |
| **Manual E2E** | Create company → list updates without full page reload |

---

### 4. Create client → refresh

| Field | Value |
|-------|-------|
| **Status** | **PASS** |
| **Files** | `app/clients/page.tsx`, `app/lib/atlas-clients-repository.ts` |
| **Notes** | Requires active company; `reloadClients()` after upsert. Migrations: `ensure_atlas_clients_baseline.sql`, `20260528140000_atlas_clients_sprint_c.sql` |
| **Manual E2E** | Set active company → create client → list updates |

---

### 5. Create sales invoice → refresh

| Field | Value |
|-------|-------|
| **Status** | **PASS** (after live readiness fix) |
| **Files** | `app/factures/page.tsx`, `app/lib/atlas-invoices-repository.ts`, `app/lib/atlas-entity-ownership.ts` |
| **Fix (2026-05-28 PM)** | List scoped to active company; create requires owned company + client-in-company validation |
| **Manual E2E** | Create invoice → list updates; switch company → list shows only that company’s invoices |

---

### 6. Upload image invoice → OCR → supplier invoice → comptabilité

| Field | Value |
|-------|-------|
| **Status** | **PASS** (after fix) |
| **Files** | `app/documents/page.tsx`, `app/api/documents/upload/route.ts`, `app/api/documents/[id]/ocr/route.ts`, `app/lib/atlas-supplier-invoices-repository.ts`, `app/comptabilite/page.tsx` |
| **Error (before fix)** | Supabase path did not navigate to `/comptabilite` after supplier invoice create (local mode did) |
| **Fix applied** | `router.push('/comptabilite')` when `result.created >= 1` in `createSupplierInvoiceSupabase` |
| **Dependencies** | Documents migrations + supplier invoice migrations + Storage bucket `atlas-documents`; OCR requires AI provider |
| **Manual E2E** | JPEG upload → OCR → Créer facture fournisseur → lands on comptabilité with updated KPIs |

---

### 7. Upload multi-page PDF → multiple supplier invoices

| Field | Value |
|-------|-------|
| **Status** | **BLOCKED** (migration-dependent) |
| **Files** | `app/lib/atlas-pdf-ocr-multipage.ts`, `app/lib/atlas-ocr-invoices-detect.ts`, `app/api/documents/[id]/ocr/route.ts` |
| **Error if migration missing** | Without `20260528170000_atlas_supplier_invoices_multi_invoice.sql`, unique `(user_id, document_id)` allows only one supplier invoice; additional inserts hit `23505` and may be skipped |
| **Fix** | Apply migration in Supabase SQL Editor (not a code change) |
| **Manual E2E** | 4-invoice PDF → N detected → N rows in `atlas_supplier_invoices` |

---

### 8. Supplier invoices → comptabilité KPIs update

| Field | Value |
|-------|-------|
| **Status** | **PASS** (after fix) |
| **Files** | `app/comptabilite/page.tsx` |
| **Error (before fix)** | KPIs loaded once on mount; stale after creating supplier invoices from Documents |
| **Fix applied** | `reloadAccountingData()` on tab visibility + after journal entry; Documents navigates to comptabilité after create |
| **Notes** | `balanceFournisseur` sums supplier invoices for active company. Sales KPIs now scoped to active company via `listAtlasInvoices()`. |
| **Manual E2E** | Create supplier invoice → comptabilité Balance fournisseur updates |

---

### 9. Admin plan update persists

| Field | Value |
|-------|-------|
| **Status** | **BLOCKED** (live E2E) / **PASS** (code) |
| **Files** | `app/admin/users/[id]/user-detail-client.tsx`, `app/api/admin/users/route.ts`, `app/lib/atlas-subscription-sync.ts`, `app/api/admin/manual-subscriptions/activate/route.ts` |
| **Requirements** | `SUPABASE_SERVICE_ROLE_KEY` on server; admin auth via profile role / owner email |
| **Notes** | `/admin/plans` is read-only catalog. PATCH user plan writes `atlas_subscriptions` + syncs profile entitlements when service role present. |
| **Manual E2E** | Admin → Users → change plan → reload → verify `profiles.plan` + active subscription row |

---

### 10. Production-blocked routes show stabilization page

| Field | Value |
|-------|-------|
| **Status** | **PASS** |
| **Files** | `app/lib/atlas-runtime-guards.ts`, `app/components/safety/ProductionBlockedSurface.tsx`, `app/tva/page.tsx`, `app/rapports/page.tsx`, `app/agents/page.tsx`, `app/etude-projet/page.tsx` |
| **Verified** | `isDemoFeatureBlocked()` returns true when `NODE_ENV=production` for `tva_simulation`, `reports_static_pdf`, `agents_mock`, `etude_projet_wizard`. Each route returns `ProductionBlockedSurface` before demo content. |
| **Manual E2E** | `npm run build && npm start` → visit `/tva`, `/rapports`, `/agents`, `/etude-projet` → stabilization message, no demo data |

---

### 11. No demo/fake data for fresh account

| Field | Value |
|-------|-------|
| **Status** | **PASS** |
| **Files** | `app/clients/page.tsx`, `app/factures/page.tsx`, `app/companies/page.tsx`, `app/comptabilite/page.tsx`, `app/signup/page.tsx` |
| **Verified** | No `seedClients`, `defaultCompanies`, or invoice seeds in app code. Demo signup seed only in `development` + local backend. Client portal demo opt-in only. |
| **Residual** | Dashboard static fiscal deadline list (`app/page.tsx`) — indicatif copy, not CRM seed data |
| **Manual E2E** | New Supabase user → zero companies/clients/invoices until created |

---

### 12. No localStorage business data in production mode

| Field | Value |
|-------|-------|
| **Status** | **PASS** (after live readiness fix) |
| **Files** | `app/lib/atlas-usage-limits.ts`, `app/lib/atlas-data-source.ts`, all `atlas-*-repository.ts` |
| **Fix (2026-05-28 PM)** | `refreshAtlasUsageState()` — plan from `atlas_subscriptions`, counts from DB; localStorage usage keys dev-only |
| **Residual** | Pro add-on slots in `atlas-company-addons` localStorage (narrow) |
| **Manual E2E** | Usage widget shows "Supabase"; DevTools → no business localStorage writes during CRUD |

---

## Blockers fixed in this pass

### Verification pass (2026-05-28 AM)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Silent company creation failure on signup | `app/signup/page.tsx` | Surface error via `atlasCompanyErrorMessage`, stop redirect |
| 2 | Comptabilité KPIs stale after Documents flow | `app/comptabilite/page.tsx` | `reloadAccountingData` on visibility + after journal add |
| 3 | Supabase OCR → no navigation to comptabilité | `app/documents/page.tsx` | `router.push('/comptabilite')` when supplier invoices created |

### Live readiness pass (2026-05-28 PM)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 4 | Usage limits from localStorage in Supabase mode | `app/lib/atlas-usage-limits.ts` | `refreshAtlasUsageState()` — plan from `atlas_subscriptions`, counts from DB |
| 5 | Invoice cross-company leakage | `app/lib/atlas-invoices-repository.ts` | List/create/update/delete scoped to active company + ownership helpers |
| 6 | Client resolution cross-company | `app/lib/atlas-active-company.ts` | `resolveClientIdByName` scoped to active company |
| 7 | Usage widget showed "LocalStorage" in prod | `app/components/usage/UsageWidget.tsx` | Refresh from Supabase; badge shows source |

---

## Remaining blockers before selling

### Ops / migrations (must apply in Supabase)

1. `ensure_atlas_supplier_invoices_baseline.sql`
2. `20260528160000_atlas_supplier_invoices_sprint_e.sql`
3. **`20260528170000_atlas_supplier_invoices_multi_invoice.sql`** — required for multi-invoice PDFs
4. `ensure_atlas_payments_baseline.sql` — payments on factures
5. `ensure_atlas_documents_baseline.sql` + `20260528150000_atlas_documents_real_foundation.sql`
6. `ensure_atlas_clients_baseline.sql`, `20260528140000_atlas_clients_sprint_c.sql`
7. `20260528130000_profiles_baseline_sprint_b.sql`

### Product / backend gaps (not fixed — out of scope)

| Gap | Impact |
|-----|--------|
| `/tva`, `/rapports`, `/agents`, `/etude-projet` blocked in production | Intentional until real backends ship |
| Pro add-on company slots (`atlas-company-addons`) | Still localStorage — narrow edge case |
| Onboarding preferences not persisted | UX only |
| `/admin/plans` read-only | Cannot edit catalog from admin UI |
| Grand-livre / Bilan | Journal only; no full GL engine |

See also: **`FINAL_LIVE_READINESS_CHECKLIST.md`**

### Live QA checklist (required before go-live)

- [ ] Full signup → company → client → invoice → payment flow
- [ ] Image OCR → supplier invoice → comptabilité KPIs
- [ ] Multi-page PDF → N supplier invoices (after migration 20260528170000)
- [ ] Admin plan change persists in DB
- [ ] Production build: blocked routes show stabilization page
- [ ] Fresh account: no seeded CRM data
- [ ] DevTools: no business localStorage writes in production mode

---

## Build result

```
npm run build — PASSED
Next.js 16.2.3 · 75 routes · TypeScript OK
```

**Files changed (verification):** `app/signup/page.tsx`, `app/comptabilite/page.tsx`, `app/documents/page.tsx`

**Files changed (live readiness):** `app/lib/atlas-usage-limits.ts`, `app/lib/atlas-invoices-repository.ts`, `app/lib/atlas-entity-ownership.ts`, `app/lib/atlas-active-company.ts`, `app/factures/page.tsx`, `app/page.tsx`, `app/companies/page.tsx`, `app/comptabilite/page.tsx`, `app/components/usage/UsageWidget.tsx`, `app/components/trial/TrialUpgradeBanner.tsx`, `FINAL_LIVE_READINESS_CHECKLIST.md`
