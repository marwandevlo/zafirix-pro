# FINAL LIVE READINESS CHECKLIST — ZAFIRIX PRO

**Date:** 2026-05-28  
**Purpose:** Go/no-go checklist before selling to real customers.

---

## Code fixes completed (this pass)

- [x] Usage limits read plan from `atlas_subscriptions` via `resolveEffectiveEntitlement`
- [x] Usage counts from Supabase (`atlas_companies`, `atlas_invoices`, `atlas_payments`)
- [x] localStorage usage/subscription keys **dev-only** (local backend)
- [x] Invoice list scoped to **active company**
- [x] Invoice create/update/delete require **owned active company**
- [x] Invoice `client_id` validated against same company
- [x] Client name resolution scoped to active company

---

## Environment (production / staging)

- [ ] `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (admin plan sync, trial claim, profile PATCH)
- [ ] `ANTHROPIC_API_KEY` or configured AI provider (OCR / consultant)
- [ ] `PADDLE_WEBHOOK_SECRET` + `PADDLE_API_KEY` (if Paddle billing live)
- [ ] Do **not** set `NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true` in production

---

## Supabase migrations (apply in SQL Editor)

Run in order (skip if already applied):

1. [ ] `20260528130000_profiles_baseline_sprint_b.sql`
2. [ ] `20260428120000_atlas_companies_accounting.sql`
3. [ ] `20260528120000_atlas_companies_normalized_columns.sql`
4. [ ] `ensure_atlas_clients_baseline.sql` + `20260528140000_atlas_clients_sprint_c.sql`
5. [ ] `20260430030000_atlas_saas_entities_links.sql` (invoices)
6. [ ] `ensure_atlas_payments_baseline.sql`
7. [ ] `ensure_atlas_documents_baseline.sql` + `20260528150000_atlas_documents_real_foundation.sql`
8. [ ] `ensure_atlas_supplier_invoices_baseline.sql`
9. [ ] `20260528160000_atlas_supplier_invoices_sprint_e.sql`
10. [ ] **`20260528170000_atlas_supplier_invoices_multi_invoice.sql`** (multi-invoice PDF)

---

## Live QA — core CRM (must pass)

- [ ] **Signup** → company created → active company set → onboarding
- [ ] **Settings** → profile + company fields persist after refresh
- [ ] **Companies** → create → list updates → activate company
- [ ] **Clients** → create under active company → list updates
- [ ] **Factures** → create under active company → list shows only that company’s invoices
- [ ] **Switch company** → factures list changes (no cross-company leakage)
- [ ] **Usage widget** → shows Supabase badge; counts match DB
- [ ] **Trial limit** → 6th invoice blocked when on free-trial (if applicable)

---

## Live QA — documents & comptabilité

- [ ] Upload image → OCR → create supplier invoice → comptabilité KPIs update
- [ ] Multi-page PDF → N invoices detected → N supplier rows created
- [ ] Comptabilité Balance fournisseur reflects supplier invoices
- [ ] Journal entry persists after refresh

---

## Live QA — admin & billing

- [ ] Admin user plan change → `profiles.plan` + `atlas_subscriptions` synced
- [ ] Manual payment activate → subscription active
- [ ] Paddle webhook (if enabled) → entitlement sync

---

## Live QA — production guards

- [ ] `/tva`, `/rapports`, `/agents`, `/etude-projet` → stabilization blocked page
- [ ] `/client` → blocked unless demo flag (should be blocked in prod)
- [ ] Fresh account → **zero** seeded clients/invoices/companies
- [ ] DevTools → no writes to `atlas_*` business keys in localStorage during CRUD

---

## Known remaining gaps (not blocking CRM sell, document honestly)

| Gap | Impact |
|-----|--------|
| `/tva`, `/rapports`, `/agents`, `/etude-projet` | Blocked in production until real backends |
| Pro company add-on slots | Still read from localStorage (`atlas-company-addons`) |
| Dashboard fiscal deadlines | Static indicatif calendar |
| Onboarding prefs | Not persisted to Supabase |
| Grand-livre / Bilan | Journal only |

---

## Build gate

```bash
npm run build
```

Last verified: **passed** (2026-05-28).
