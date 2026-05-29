# ZAFIRIX PRO — Production audit master

**Product:** ZAFIRIX PRO (repository: `atlas-os`)  
**Stack:** Next.js 16 (App Router), Supabase (Auth + Postgres + RLS), Paddle (billing), Anthropic (AI).  
**Audit date:** 2026-05-11  
**Method:** Static codebase review (routes, repos, migrations, middleware, grep for persistence and demo patterns).

---

## Executive summary

The application has a **strong UI shell** and **meaningful Supabase schema** (entities, RLS on core tables, admin/service-role patterns on several routes). Production readiness is **uneven**: critical SaaS paths are **partially** on Supabase while **localStorage** and **client-only demo logic** remain in multiple modules. **API validation is ad hoc** (no shared Zod layer in `app/api`). **Tenant isolation** relies heavily on RLS + `user_id` columns; application code must consistently scope by `company_id` where multi-company is required. **Admin** is split between middleware (JWT/profile) and **dangerous dev-only localStorage role** flags.

**Strategic posture:** stabilize and harden in place — no greenfield rebuild. Prioritize P0 items in `SPRINT_EXECUTION_PLAN.md`.

---

## Classification legend

| Tag | Meaning |
|-----|---------|
| **REAL** | End-to-end persistence, safe for production with correct env and RLS. |
| **PARTIAL** | Real backend exists but UX/API/repo gaps, dual local/Supabase paths, or weak validation. |
| **MOCK** | Hardcoded or client-only fiction; must not ship as paid capability without rebuild. |
| **BROKEN** | Known incorrect behavior, security defect, or non-functional critical path. |

---

## Module audit matrix

### Frontend (by major route)

| Area | Route / module | Classification | Notes |
|------|----------------|----------------|-------|
| Landing / marketing | `/landing`, `/pricing` | REAL / PARTIAL | Public; analytics hooks present. |
| Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password` | PARTIAL | Supabase auth; signup still has `local_demo` branching when backend not Supabase. |
| Dashboard home | `/` | PARTIAL | Depends on data sources; prior work removed misleading KPIs (verify in tree). |
| Companies | `/companies` | PARTIAL | Supabase path exists; localStorage path for `local` backend + legacy keys `atlas_companies` / `atlas_company`. |
| Clients | `/clients` | PARTIAL | Supabase CRUD path; local demo uses localStorage. |
| Invoices | `/factures` | PARTIAL | Supabase upsert/list/delete; PDF/export behavior must be verified per release. |
| Documents | `/documents` | PARTIAL | Table + RLS; repo dual-mode; file **storage** vs DB row needs audit. |
| RH | `/rh` | PARTIAL | Reads `atlas_companies` from localStorage for context; employees repo dual-mode. |
| Comptabilité | `/comptabilite` | PARTIAL | Accounting repo is localStorage-first when not Supabase. |
| Juridique | `/juridique` | PARTIAL | Heavy UI; company context from localStorage; AI-assisted generation = beta risk. |
| Consultant (AI) | `/consultant` | PARTIAL / BETA | Real Anthropic API when configured; must stay labeled beta + legal disclaimer. |
| Settings | `/settings` | PARTIAL | Persists active company to localStorage key `atlas_company`. |
| Subscription UX | `/subscription` | PARTIAL | localStorage cache/sync story; must align with single subscription source of truth. |
| Payment UX | `/payment`, `/payment/success` | PARTIAL | Paddle + manual flows; pending order localStorage in `PaymentClient`. |
| Onboarding | `/onboarding` | PARTIAL | localStorage prefs. |
| Client portal | `/client` | **MOCK** | Hardcoded PIN `1234`, static arrays for invoices/declarations — **not production**. |
| Admin suite | `/admin/*` | PARTIAL | Middleware protects when Supabase; **local admin** via `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` + localStorage role is dev-only by design but high risk if misconfigured. |
| Agents | `/agents` | PARTIAL | Depends on wiring to `/api/ai` and product scope. |
| Fiscal modules | `/tva`, `/is`, `/ir` | PARTIAL | Mostly calculators/UX; legal positioning in `LEGAL_AND_COMMERCIAL_RISKS.md`. |

### Backend — repositories (`app/lib/*-repository.ts`)

| Repository | Classification | Persistence |
|------------|----------------|---------------|
| `atlas-companies-repository` | PARTIAL | Supabase + localStorage |
| `atlas-clients-repository` | PARTIAL | Supabase + localStorage |
| `atlas-invoices-repository` | PARTIAL | Supabase + localStorage |
| `atlas-payments-repository` | PARTIAL | Supabase + localStorage |
| `atlas-documents-repository` | PARTIAL | Supabase + localStorage |
| `atlas-employees-repository` | PARTIAL | Supabase + localStorage |
| `atlas-projects-repository` | PARTIAL | Supabase + localStorage |
| `atlas-links-repository` | PARTIAL | Supabase + localStorage |
| `atlas-accounting-repository` | PARTIAL | localStorage when not Supabase |
| `atlas-supplier-invoices-repository` | PARTIAL | localStorage when not Supabase |

### API routes (`app/api/**`)

| Classification | Count / pattern |
|----------------|-----------------|
| **REAL** (auth + some validation) | Several admin routes (bearer + `isAtlasAdminUser`), manual payment request (auth + rate limit + enum checks), Paddle webhook (signature when secret set), analytics track (allowlist + rate limit). |
| **PARTIAL** | Most user routes rely on manual JSON casting, no Zod; error bodies sometimes expose `error.message`. |
| **MOCK / thin** | `/api/paddle/checkout` documents that full server-side transaction creation may be extended — treat as **integration surface**, not complete merchant backend. |

**Cross-cutting:** `grep` shows **no Zod** under `app/api` today — see `API_VALIDATION_MATRIX.md`.

### Supabase — migrations & RLS

| Aspect | Classification | Notes |
|--------|----------------|-------|
| Core entity tables | REAL | `atlas_clients`, `atlas_invoices`, `atlas_companies`, `atlas_documents`, etc., with RLS in `20260430030000_atlas_saas_entities_links.sql`. |
| Subscriptions / payments | PARTIAL | Multiple migrations (`subscriptions_*`, `atlas_payment_requests`); unify per `SUBSCRIPTION_ARCHITECTURE_PLAN.md`. |
| Admin read policies | PARTIAL | `atlas_saas_admin_read_policies.sql` — verify least privilege vs service role usage. |
| Audit logging | PARTIAL | `atlas_admin_logs` migration exists; ensure all sensitive admin mutations log. |

### Middleware

| Concern | Classification | Notes |
|---------|----------------|-------|
| Private route auth | PARTIAL / REAL | Supabase session via `@supabase/ssr` cookies when `atlasDataBackend() === 'supabase'`. |
| Production without Supabase | REAL | Redirects to `/landing` when `NODE_ENV === 'production'` and backend not supabase. |
| Admin local bypass | **RISK** | Commented path: client localStorage admin when dev flag set — must never leak to production config. |

### Cron / background

| Route | Classification | Notes |
|-------|----------------|-------|
| `/api/cron/email-lifecycle` | PARTIAL | Gated by `CRON_SECRET` in handler (verify); not middleware-auth’d by design. |

### Storage / uploads / PDF

| Concern | Classification | Notes |
|---------|----------------|-------|
| DB metadata for documents | PARTIAL | `atlas_documents`; `content` column migration exists. |
| Object storage (Supabase Storage) | PARTIAL / UNKNOWN | Confirm signed URLs, bucket policies, virus scan policy. |
| PDF (jspdf) | PARTIAL | Client-side generation — acceptable if output is user-owned; persistence of generated artifacts optional. |

### Search

| `/api/search` | PARTIAL | Bearer auth + RLS-scoped queries; company search fetches up to 50 rows then filters in memory — acceptable under RLS but tune with DB-side JSON search later. |

### Email

| `/api/email/welcome`, lifecycle cron | PARTIAL | Depends on provider keys and idempotency tables (`atlas_lifecycle_email_sends`). |

### Analytics / funnel

| `analytics/track`, `funnel/track` | PARTIAL | Anonymous by design; rate limits on analytics; funnel local buffer still uses localStorage in app lib. |

### Logging / observability

| Sentry, `atlas-server-log` | PARTIAL | Dependencies present; ensure no PII in structured logs; production DSN configuration. |

---

## Related documents

- `REAL_VS_FAKE_MATRIX.md` — quick shippable vs non-shippable grid.  
- `SECURITY_HARDENING_PLAN.md`, `MULTI_TENANT_SECURITY_REPORT.md`, `API_VALIDATION_MATRIX.md`  
- `LOCALSTORAGE_REMOVAL_PLAN.md`, `SUBSCRIPTION_ARCHITECTURE_PLAN.md`  
- `INVOICE_SYSTEM_STABILIZATION.md`, `ADMIN_SYSTEM_STABILIZATION.md`, `AI_FEATURES_STATUS.md`  
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md`, `TECHNICAL_DEBT_MASTER.md`, `LEGAL_AND_COMMERCIAL_RISKS.md`, `SPRINT_EXECUTION_PLAN.md`  
- Existing stabilization docs: `STABILIZATION_ROADMAP.md`, `CORE_BACKEND_PLAN.md`, `API_HARDENING_CHECKLIST.md`

---

## Exit criteria (production launch gate)

1. No **MOCK** surfaces exposed to paying users without explicit “demo” tenant.  
2. No **critical** business state in localStorage in production (`NODE_ENV=production` forces Supabase backend — keep, and remove remaining read paths).  
3. All **critical APIs** pass `API_VALIDATION_MATRIX.md` minimum bar.  
4. Subscription and payment state have **one** authoritative source and reconciled webhooks.  
5. RLS + application-level `company_id` checks documented and tested for cross-tenant scenarios.
