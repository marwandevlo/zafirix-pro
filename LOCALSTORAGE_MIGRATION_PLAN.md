# localStorage Migration Plan

**Goal:** When `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase` (and production, which forces Supabase), **no business-critical** reads/writes use `localStorage`.

**Legend:** ✅ Sprint 1 addressed · ⏳ later sprint · 🟡 dev-only / acceptable

---

## Sprint 1 — Pages → repositories (Supabase path)

| Key / area | File(s) | Status |
|------------|---------|--------|
| `atlas_clients` | `app/clients/page.tsx` | ✅ Use `listAtlasClients` / `upsertAtlasClient` / `deleteAtlasClient` |
| `atlas_invoices` seed | `app/factures/page.tsx` | ✅ No demo seed / no `writeInvoicesToLocalStorage` when Supabase |
| New invoice id | `app/factures/page.tsx` | ✅ `crypto.randomUUID()` when Supabase |
| `atlas_companies` | `app/companies/page.tsx` | ✅ Use company repository CRUD + active flag |

---

## ⏳ Sprint 2 — Subscription & payment UX

| Key | File(s) | Action |
|-----|---------|--------|
| `atlas_pending_subscriptions` | `app/payment/PaymentClient.tsx` | Replace with DB-only status from `atlas_payment_requests` |
| `atlas_active_subscriptions` | `app/subscription/page.tsx`, admin clients | Read from Supabase / admin API only |

---

## ⏳ Sprint 2 — Usage & limits

| Key | File(s) | Action |
|-----|---------|--------|
| `atlas_usage` | `app/lib/atlas-usage-limits.ts` | Compute from DB counts + `profiles.plan` server-side |

---

## ⏳ Sprint 3 — Companies consumers

| Key | File(s) | Action |
|-----|---------|--------|
| `atlas_companies` / `atlas_company` | `app/settings/page.tsx`, `app/juridique/page.tsx`, `app/rh/page.tsx`, `app/consultant/page.tsx`, `app/etude-projet/page.tsx` | Read active company from `listAtlasCompanies` + `setActiveAtlasCompany` |

---

## ⏳ Sprint 3 — Other repositories (local mode only today)

| Repository | Notes |
|--------------|--------|
| `atlas-links-repository.ts` | Supabase path when links table wired |
| `atlas-employees-repository.ts` | Same |
| `atlas-projects-repository.ts` | Same |
| `atlas-accounting-repository.ts` | Same |
| `atlas-supplier-invoices-repository.ts` | Same |

---

## 🟡 Acceptable for beta (with disclosure)

| Key | File | Note |
|-----|------|------|
| `atlas_onboarding_prefs` | `app/onboarding/page.tsx` | UX prefs — low risk |
| `atlas_funnel_local_buffer` | `app/lib/atlas-funnel-local-buffer.ts` | Buffer until server queue reliable |
| Analytics anon id | `app/lib/analytics-track.ts` | Document in privacy policy |
| Pro add-on slots | `app/lib/atlas-company-addons.ts` | Should move to DB when billing solid |

---

## 🟡 Development only

| Key | File | Note |
|-----|------|------|
| `atlas_user_role` | `AdminShell.tsx`, `AdminDashboardClient.tsx`, `admin/subscriptions/page.tsx` | Only when `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` |

---

## Repositories (dual mode by design)

These **read/write** `localStorage` only when **not** Supabase — intentional until Sprint N removes `local` mode:

- `atlas-invoices-repository.ts`, `atlas-clients-repository.ts`, `atlas-documents-repository.ts`, `atlas-payments-repository.ts`, `atlas-companies-repository.ts`, …

---

## Cleanup (optional)

- Remove duplicate path `app\api\ai\route.ts` vs `app/api/ai/route.ts` on disk if both exist.
