# FINAL QA REPORT — ZAFIRIX PRO

**Date:** 2026-05-28  
**App URL (local):** http://localhost:3000  
**Backend:** `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`  
**Method:** Automated schema probe + manual browser steps (you execute clicks; results recorded below)

---

## Automated pre-check (run anytime)

```bash
node scripts/verify-supabase-schema.mjs
```

**Result on 2026-05-28:**

| Check | Status |
|-------|--------|
| Env: supabase backend + keys | **PASS** |
| `profiles` | **PASS** |
| `atlas_companies` | **PASS** |
| `atlas_clients` | **PASS** |
| `atlas_invoices` | **PASS** |
| `atlas_payments` | **PASS** |
| `atlas_documents` | **PASS** |
| `atlas_supplier_invoices` | **PASS** |
| `atlas_supplier_invoices.source_page` (multi-invoice) | **PASS** |
| `storage:atlas-documents` | **PASS** |
| `atlas_accounting_entries` | **PASS** |
| **`atlas_subscriptions`** | **FAIL** — table not found |
| **`atlas_payment_requests`** | **FAIL** — table not found |
| Legacy `subscriptions` | exists (older schema) |

### Step 1 verdict: **FAIL** (2 blocking tables missing)

**Fix before signup / trial / admin plan QA:**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Paste and run entire file: `supabase/migrations/ensure_atlas_subscriptions_baseline.sql`
3. (Recommended next) Run: `supabase/migrations/20260516120000_sprint2_billing_subscription_integrity.sql`
4. Re-run: `node scripts/verify-supabase-schema.mjs` → must show ALL CHECKS PASSED

**Impact if skipped:** free trial claim, usage widget plan, admin plan PATCH, `/subscription` page will error or show no plan.

---

## Step 2 — Fresh signup test

**Prerequisite:** Step 1 PASS

### What to do

1. Open **Incognito** window → http://localhost:3000/signup
2. Use a **new email** never used before (e.g. `qa+20260528a@test.local` — use a real inbox if email confirm is on)
3. Fill: name, email, password (8+ chars), company name, city
4. Click **Créer mon compte** / submit
5. Expected: redirect to `/onboarding` (or login if email confirmation required)

### Verify in Supabase (Table Editor)

| Table | Expected |
|-------|----------|
| `auth.users` | new row |
| `profiles` | row with your user id |
| `atlas_companies` | 1 row, `is_active = true` |
| `atlas_subscriptions` | 1 row `plan_id = free-trial`, `status = trial` |

### Record

| Result | Notes |
|--------|-------|
| **BLOCKED** | Pending Step 1 (`atlas_subscriptions` missing) |

**If FAIL after Step 1 fixed:** copy exact error from UI or browser Console (F12).

---

## Step 3 — Company / client / invoice flow

**Prerequisite:** logged in, Step 1 PASS, onboarding done

### 3a — Company

1. Sidebar → **Mes sociétés** (`/companies`)
2. Click **+ Nouvelle société**
3. Fill raison sociale (e.g. `QA SARL B`), save
4. Click row to **activate** (checkmark / actif)
5. Hard refresh (F5) → company still listed and active

| Sub-step | Result |
|----------|--------|
| Create company | **PENDING** |
| Refresh persists | **PENDING** |

### 3b — Client

1. Sidebar → **Clients** (`/clients`)
2. If banner “sélectionnez une société” → go back, activate company
3. **+ Nouveau client** → name `Client QA`, save
4. F5 → client still visible

| Sub-step | Result |
|----------|--------|
| Create client | **PENDING** |
| Refresh persists | **PENDING** |

### 3c — Invoice

1. Sidebar → **Factures** (`/factures`)
2. **+ Nouvelle facture** → numéro `F-QA-001`, client `Client QA`, montant HT `1000`, save
3. Row appears in list
4. F5 → invoice still visible
5. Dashboard (`/`) → CA KPI includes ~1 200 MAD TTC

| Sub-step | Result |
|----------|--------|
| Create invoice | **PENDING** |
| Refresh persists | **PENDING** |
| Dashboard CA | **PENDING** |

---

## Step 4 — OCR multi-invoice PDF flow

**Prerequisite:** active company, `ANTHROPIC_API_KEY` set, migrations 7–10 applied

### What to do

1. **Documents IA** (`/documents`)
2. Upload a **multi-page PDF** with 2+ distinct supplier invoices (or re-OCR an existing doc)
3. Wait for progress: rendering → analyzing page X/Y → processed
4. UI should show **“N factures détectées”**
5. Click **Créer N factures** (or per-invoice create)
6. Expected: success message → redirect to `/comptabilite`

### Verify in Supabase

`atlas_supplier_invoices` → N rows for same `document_id`, different `invoice_number` / `source_page`

| Result | Notes |
|--------|-------|
| **PENDING** | Manual test |

**Common failures:**

| Error | Cause |
|-------|-------|
| Table missing banner | Run supplier invoice migrations |
| Only 1 invoice from 4-page PDF | Re-OCR doc processed before multi-invoice code; or migration 20260528170000 missing |
| OCR timeout | PDF >10 pages or slow API |

---

## Step 5 — Comptabilité flow

**Prerequisite:** Step 3c + Step 4 (or at least one supplier invoice)

### What to do

1. Open **Comptabilité** (`/comptabilite`)
2. **Balance fournisseur** / supplier table → reflects OCR supplier invoice TTC
3. **+ Nouvelle écriture** → fill libellé, compte, debit/credit → save
4. F5 → journal line persists
5. Return from Documents after new supplier invoice → tab away and back (visibility refresh) → KPIs update

| Sub-step | Result |
|----------|--------|
| Supplier KPIs | **PENDING** |
| Journal persist | **PENDING** |
| KPI refresh | **PENDING** |

---

## Step 6 — Admin plan update

**Prerequisite:** Step 1 PASS (`atlas_subscriptions`), admin access

### Setup admin

Your `.env.local` has `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN=true` (dev only). Production uses profile role / owner email.

1. Log in as admin user (owner email in `atlas-admin-access` or local admin flag)
2. Go to **/admin/users**
3. Open a test user → **Modifier**
4. Change plan (e.g. free → pro) → save
5. Reload user detail → plan persisted

### Verify in Supabase

| Table | Expected |
|-------|----------|
| `profiles.plan` | updated bucket |
| `atlas_subscriptions` | new active row, old cancelled |

| Result | Notes |
|--------|-------|
| **BLOCKED** | Pending Step 1 + manual admin session |

---

## Step 7 — Active company isolation

**Prerequisite:** 2 companies, invoices on each

### What to do

1. **Mes sociétés** → create **QA SARL A** and **QA SARL B** (if not already)
2. Activate **A** → **Factures** → create `F-A-001` for a client under A
3. Activate **B** → **Factures** → list should **NOT** show `F-A-001`
4. Create `F-B-001` on B
5. Switch back to **A** → only `F-A-001` visible

| Sub-step | Result |
|----------|--------|
| Company A invoices only on A | **PENDING** |
| Company B invoices only on B | **PENDING** |
| No cross-leak | **PENDING** |

---

## Production guards (quick)

With `npm run build && npm start` (production mode):

| URL | Expected |
|-----|----------|
| `/tva` | Stabilization blocked page |
| `/rapports` | Stabilization blocked page |
| `/agents` | Stabilization blocked page |
| `/client` | Blocked (no demo flag) |

| Result |
|--------|
| **PENDING** — run in production build locally |

---

## Summary scoreboard

| Step | Status | Blocker |
|------|--------|---------|
| 1. Migrations | **FAIL** | Run `ensure_atlas_subscriptions_baseline.sql` |
| 2. Signup | **BLOCKED** | Step 1 |
| 3. Company/client/invoice | **PENDING** | Manual |
| 4. OCR multi-PDF | **PENDING** | Manual (+ Step 1 for trial limits) |
| 5. Comptabilité | **PENDING** | Manual |
| 6. Admin plan | **BLOCKED** | Step 1 |
| 7. Company isolation | **PENDING** | Manual |

---

## Build gate

```bash
npm run build
```

**Last run:** PASSED (2026-05-28, after live readiness fixes)

---

## Next action for you

1. **Run the subscription baseline SQL** in Supabase (Step 1 fix)
2. `node scripts/verify-supabase-schema.mjs` until all PASS
3. Reply with results from Steps 2–7 (or errors/screenshots) — I will update this report and fix any code blockers only
