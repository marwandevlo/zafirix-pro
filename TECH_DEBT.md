# Technical Debt — Atlas OS

Items verified in repository as of this audit. “Owner” suggestions are indicative.

---

## D1 — Dual subscription tables

**Tables:** `public.subscriptions` (Paddle + some manual flows) vs `public.atlas_subscriptions` (manual Morocco, trials, admin dashboard counts).  
**Files:** `app/api/webhooks/paddle/route.ts`, `app/api/admin/manual-subscriptions/activate/route.ts`, `app/api/admin/subscriptions/activate/route.ts`, `app/api/admin/dashboard-stats/route.ts`, `app/api/admin/revenue-overview/route.ts`.  
**Debt:** No single **state machine** or reconciliation view.  
**Fix:** One canonical `subscription_entitlements` view or table; writers update one row per user; Paddle webhook is idempotent event log.

---

## D2 — localStorage persistence (non-exhaustive)

Still present for:

| Area | Files |
|------|--------|
| Repositories (when `local` backend) | `atlas-invoices-repository.ts`, `atlas-clients-repository.ts`, `atlas-documents-repository.ts`, `atlas-payments-repository.ts`, `atlas-companies-repository.ts`, `atlas-links-repository.ts`, `atlas-employees-repository.ts`, `atlas-projects-repository.ts`, `atlas-accounting-repository.ts`, `atlas-supplier-invoices-repository.ts` |
| Usage / subscriptions UI cache | `atlas-usage-limits.ts`, `subscription/page.tsx`, `payment/PaymentClient.tsx` |
| Companies hub | `companies/page.tsx`, `settings/page.tsx`, `juridique/page.tsx`, `rh/page.tsx`, `consultant/page.tsx`, `etude-projet/page.tsx` |
| Onboarding | `onboarding/page.tsx` |
| Funnel | `atlas-funnel-local-buffer.ts` |
| Analytics anon id | `analytics-track.ts` |
| Pro add-on slots | `atlas-company-addons.ts` |
| Admin dev | `AdminDashboardClient.tsx`, `admin/subscriptions/page.tsx`, `AdminShell.tsx` |

**Note:** Production **forces** Supabase backend (`atlas-data-source.ts`), but **client UX** still reads/writes localStorage in several flows — **split-brain** with DB.

---

## D3 — `company_json` blob

**Table:** `atlas_companies` stores flexible JSON.  
**Debt:** Hard to migrate, index, or enforce schema; reporting is awkward.  
**Fix:** Gradual normalization (columns for legal name, ICE, etc.) + JSON for extensibility only.

---

## D4 — In-memory rate limiting

**Files:** `app/lib/ai-rate-limit.ts`, `app/lib/payment-rate-limit.ts` (and similar).  
**Debt:** Not correct under multiple instances or serverless concurrency.  
**Fix:** Upstash Redis or edge rate limit + user id keyed limits.

---

## D5 — Console logging in hot paths

**Example:** `app/api/webhooks/paddle/route.ts` — `console.info` / `console.warn`.  
**Debt:** No structure for log aggregation; may leak event types.  
**Fix:** `logAtlasServerEvent` everywhere; redact payloads.

---

## D6 — Large monolithic pages

**Examples:** `app/juridique/page.tsx` (1000+ lines), `app/rh/page.tsx`, `app/documents/page.tsx`.  
**Debt:** Maintainability, testability, bundle size.  
**Fix:** Split into components + server actions where appropriate.

---

## D7 — Type safety gaps

**Pattern:** `as any`, `(supabase as any)` in admin chain (`atlas-admin-access.ts`).  
**Debt:** Runtime surprises.  
**Fix:** Generated Supabase types (`supabase gen types`) and stricter TS in admin layer.

---

## D8 — OCR / documents: no durable file store

**Flow:** `documents/page.tsx` reads file → calls `/api/ai` OCR → updates **local React state** list; library path uses `atlas_documents` repository for metadata/content, not verified Supabase Storage for binaries.  
**Debt:** No virus scan pipeline; large PDFs in memory; no WORM archive for disputes.  
**Fix:** Upload to private bucket; store pointer in `atlas_documents`; async OCR job.

---

## D9 — Owner email in source

**File:** `app/lib/admin/atlas-admin-access.ts`.  
**Debt:** Forking customers inherit your owner email unless changed.  
**Fix:** Environment configuration + documentation.

---

## D10 — Sentry + Next 16 peer mismatch

**Evidence:** `npm install @sentry/nextjs --legacy-peer-deps` may be required; peer range may not list Next 16.  
**Debt:** Upgrade churn / unexpected runtime.  
**Fix:** Pin Sentry version; follow upstream Next 16 support; add CI `npm ls` check.

---

## D11 — Duplicate API file path (cosmetic)

Glob shows `app\api\ai\route.ts` and `app/api/ai/route.ts` — same module on Windows; ensure no duplicate directories in git.

---

## D12 — Middleware deprecation

Next.js 16 message: middleware → **proxy** migration.  
**Debt:** Future breaking change.  
**Fix:** Track Next release notes; plan migration.

---

## Prioritized payoff (debt vs effort)

| Quick win | Effort |
|-----------|--------|
| Replace `console.*` in webhooks with structured log | Low |
| Env-driven owner emails | Low |
| Admin audit on all PATCH/POST admin routes | Medium |
| Redis rate limits | Medium |
| Unify subscriptions | High |

---

## Definition of “debt paid” for persistence

- Zero **business-critical** reads/writes depend on `localStorage` when `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`.  
- Usage limits computed server-side from `profiles` + subscription tables.  
- Companies CRUD exclusively via Supabase APIs or server actions with RLS.
