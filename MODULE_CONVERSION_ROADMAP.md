# ZAFIRIX PRO — Module Conversion Roadmap

**Mode:** GLOBAL REAL SAAS CONVERSION — controlled, module-by-module  
**Strategy:** Do not hide modules · do not fake implementations · do not break stabilized work  
**Companion doc:** `REAL_MODULE_CHECKLIST.md` (10-gate acceptance criteria)

---

## Executive summary

| Metric | Count |
|--------|-------|
| **REAL** | 1 (Auth) |
| **STABILIZING** | 12 |
| **BETA** | 12 |
| **BROKEN** | 2 (Client portal, Automations) |
| **Supabase tables in repo** | 19 domain tables + Auth |
| **Build status** | ✅ `npm run build` green (2026-05-28) |

**Production posture:** Tier 1 core entities (companies, clients, invoices, billing, admin) are **Supabase-backed in production** but still **STABILIZING** due to localStorage fallbacks, entitlement gaps, and missing validation. Tier 2 fiscal modules are **visible BETA simulators**. Tier 3 AI is **real API calls, ephemeral persistence**.

**Safest next module to convert:** **Companies** (Sprint A) — tenant anchor; repository exists; highest leverage with lowest regression risk if done before billing entitlements wiring.

---

## Conversion principles

1. **One module at a time** — finish all 10 gates in `REAL_MODULE_CHECKLIST.md` before starting the next
2. **No hiding** — BETA modules stay visible with `BetaSurfaceBadge`; BROKEN modules show honest empty/rebuild state
3. **Fail closed** — remove localStorage fallback on Supabase errors in production paths
4. **Preserve stabilized work** — repositories, RLS migrations, admin audit helpers, subscription sync (`atlas-subscription-sync.ts`) are baseline — extend, don't rewrite
5. **Production path only** — `atlas-data-source.ts` forces Supabase when `NODE_ENV=production`

---

## Module status registry

### Tier 1 — Critical business

| Module | Route(s) | Status | Primary persistence | Key gaps |
|--------|----------|--------|---------------------|----------|
| **Auth** | `/login`, `/signup`, `/forgot-password`, `/reset-password` | **REAL** | Supabase Auth + `profiles` | MFA, email verification UX |
| **Profiles** | `/settings` | **STABILIZING** | `atlas_companies.company_json` (not profiles) | User profile editor; fiscal ID validation |
| **Companies** | `/companies` | **STABILIZING** | `atlas_companies` | Plan slots from localStorage; JSON blob schema |
| **Clients** | `/clients` | **STABILIZING** | `atlas_clients` | No API layer; localStorage fallback |
| **Invoices** | `/factures` | **STABILIZING** | `atlas_invoices`, `atlas_payments` | Usage limits localStorage; no server numbering |
| **Billing** | `/subscription`, `/payment` | **STABILIZING** | `atlas_subscriptions`, `atlas_payment_requests`, `subscriptions` | Usage limits not wired to entitlement resolver |
| **Admin** | `/admin/*`, `/api/admin/*` | **STABILIZING** | Service-role Supabase + `atlas_admin_logs` | Audit UI; validation on all mutations |

### Tier 2 — Operational

| Module | Route(s) | Status | Primary persistence | Key gaps |
|--------|----------|--------|---------------------|----------|
| **Comptabilité** | `/comptabilite` | **BETA** | In-memory journal; KPIs from invoices | `atlas_accounting_entries` unused |
| **Rapports** | `/rapports` | **BETA** | Hardcoded PDF template data | No DB reads |
| **RH** | `/rh` | **BETA** | `atlas_documents` (generated docs) | `atlas_employees` unused on page |
| **Juridique** | `/juridique` | **BETA** | `atlas_documents` + `/api/ai` | AI drafts only; no filing workflow |
| **Documents** | `/documents` | **STABILIZING** | `atlas_documents` (library tab) | OCR in-memory; supplier invoices localStorage |

### Tier 3 — Advanced / AI

| Module | Route(s) | Status | Primary persistence | Key gaps |
|--------|----------|--------|---------------------|----------|
| **Assistant IA** | `/consultant`, overlay | **BETA** | Ephemeral chat | No session persistence |
| **Agents IA** | `/agents` | **BETA** | None | Fake stats; no task queue |
| **OCR** | `/documents` (OCR tab), `/api/ai` | **BETA** | In-memory | Results lost on refresh |
| **Automations** | (marketing on agents/TVA) | **BROKEN** | None | No workflow engine |

### Supporting surfaces

| Module | Route(s) | Status | Primary persistence | Key gaps |
|--------|----------|--------|---------------------|----------|
| **Dashboard** | `/` | **STABILIZING** | Invoice KPIs real; deadlines static | Wire fiscal calendar to real data |
| **TVA** | `/tva` | **BETA** | React state (3 hardcoded invoices) | Link to `atlas_invoices` |
| **IS** | `/is` | **BETA** | React state form | No accounting linkage |
| **IR** | `/ir` | **BETA** | React state (not `atlas_employees`) | Duplicate of RH payroll claims |
| **Étude de projet** | `/etude-projet` | **BETA** | AI report ephemeral | `atlas_projects` repo unused |
| **Client portal** | `/client` | **BROKEN** | Demo (PIN 1234) | Disabled in prod unless explicit flag |
| **Onboarding** | `/onboarding` | **STABILIZING** | localStorage prefs | No server-side onboarding state |
| **Global search** | overlay + `/api/search` | **STABILIZING** | Supabase multi-table | Clients not indexed |
| **Referral** | `/api/referral/*` | **STABILIZING** | `atlas_referral_*` | No payout settlement |

---

## Supabase schema inventory

Tables defined in `supabase/migrations/`:

| Table | Used by module(s) | Repo file |
|-------|-------------------|-----------|
| `atlas_companies` | Companies, Settings, Dashboard context | `atlas-companies-repository.ts` |
| `atlas_clients` | Clients, Invoices | `atlas-clients-repository.ts` |
| `atlas_invoices` | Factures, Dashboard, Search | `atlas-invoices-repository.ts` |
| `atlas_payments` | Factures, Comptabilité KPIs | `atlas-payments-repository.ts` |
| `atlas_documents` | Documents, RH, Juridique | `atlas-documents-repository.ts` |
| `atlas_employees` | RH (planned), Search | `atlas-employees-repository.ts` |
| `atlas_accounting_entries` | Comptabilité (table exists, page unused) | `atlas-accounting-repository.ts` (list only) |
| `atlas_projects` | Étude de projet (unused) | `atlas-projects-repository.ts` |
| `atlas_links` | Documents ↔ entities | `atlas-links-repository.ts` |
| `atlas_subscriptions` | Billing entitlement (canonical) | `atlas-subscription-sync.ts` |
| `subscriptions` | Paddle/manual ledger | webhook + admin |
| `atlas_payment_requests` | Manual Morocco payments | admin + user API |
| `atlas_admin_logs` | Admin audit | `atlas-admin-audit.ts` |
| `atlas_referral_codes`, `atlas_referrals` | Referral | `atlas-referral-server.ts` |
| `events`, `atlas_funnel_events`, `atlas_trial_events` | Analytics | various |
| `atlas_lifecycle_email_sends` | Email cron | cron route |

**Not in migrations (gaps):** `profiles` (assumed pre-existing), `atlas_supplier_invoices`, `atlas_ai_sessions`, `atlas_invoice_events` (proposed)

---

## Production blockers (P0)

| ID | Blocker | Impact | Modules affected |
|----|---------|--------|------------------|
| **P0-1** | localStorage fallback on Supabase errors in repositories | Split brain; data loss on device | Companies, Clients, Invoices, Documents |
| **P0-2** | `atlas-usage-limits.ts` reads plan from localStorage | Users can bypass plan quotas | Companies, Invoices, Billing |
| **P0-3** | Entitlement resolver not wired to all UI gates | Expired users retain access | All gated features |
| **P0-4** | `requireEntityOwner()` — auth only, no company scope | Cross-company write risk if RLS gap | All entity modules |
| **P0-5** | Client portal demo reachable with env flag | Security/reputation if flag set wrong | Client portal |
| **P0-6** | Fiscal modules (TVA/IS/IR) show hardcoded numbers | Misleading compliance claims | TVA, IS, IR, Rapports |
| **P0-7** | AI auth default (`ATLAS_AI_REQUIRE_AUTH`) | Cost abuse if misconfigured | Consultant, Juridique, OCR |
| **P0-8** | In-memory rate limits | Weak under multi-instance deploy | All API routes |

---

## Sprint execution plan

### Sprint A — Companies completion (RECOMMENDED NEXT)

**Goal:** Mark **Companies** REAL; establish tenant anchor for all downstream modules.

| Task | Risk | Files |
|------|------|-------|
| Remove localStorage fallback on Supabase error (fail closed) | Low | `atlas-companies-repository.ts` |
| Wire plan slot check to `resolveEffectiveAtlasSubscription()` | Medium | `atlas-usage-limits.ts`, `companies/page.tsx` |
| Validate active company server-side on write | Low | `atlas-active-company.ts` |
| Add loading + error states on company delete/switch | Low | `companies/page.tsx` |
| Staging RLS smoke: User A ≠ User B companies | — | manual |

**Exit:** All 10 gates pass for Companies in checklist.  
**Do not touch:** Billing webhook, admin routes, invoice numbering.

---

### Sprint B — Profiles + Settings

**Goal:** Separate user profile from company identity.

| Task | Risk | Files |
|------|------|-------|
| Add profiles migration to repo if missing | Medium | `supabase/migrations/` |
| User settings section (name, locale, notifications) | Low | `settings/page.tsx` |
| Keep company fiscal fields on `atlas_companies` | Low | existing |
| Server validation IF/ICE/RC formats | Low | new API or repository guard |

**Depends on:** Sprint A (active company stable)

---

### Sprint C — Clients REAL

| Task | Risk | Files |
|------|------|-------|
| Remove localStorage fallback | Low | `atlas-clients-repository.ts` |
| Require `company_id` on all upserts | Low | repository + page |
| Duplicate detection | Low | `clients/page.tsx` |
| Add clients to `/api/search` | Low | `api/search/route.ts` |

**Depends on:** Sprint A

---

### Sprint D — Invoices REAL

| Task | Risk | Files |
|------|------|-------|
| Remove localStorage fallback + demo seeds | Low | `atlas-invoices-repository.ts`, `factures/page.tsx` |
| Wire invoice create gate to Supabase usage count | Medium | `atlas-usage-limits.ts` |
| Server-side line total validation (client calc + DB constraint) | Medium | repository |
| Optional: `atlas_invoice_events` audit table | Medium | migration |

**Depends on:** Sprint C (client_id integrity)

---

### Sprint E — Billing entitlements REAL

**Goal:** Single entitlement path everywhere (see `SUBSCRIPTION_SOURCE_OF_TRUTH_FINAL.md`).

| Task | Risk | Files |
|------|------|-------|
| Replace `getActivePlan()` localStorage with `atlas-subscription-sync.ts` | High | `atlas-usage-limits.ts`, all gated pages |
| Subscription page: cache-only localStorage removal | Medium | `subscription/page.tsx` |
| Paddle webhook idempotency table | Medium | `api/webhooks/paddle/route.ts` |
| Manual payment amount validation vs catalog | Low | admin routes |
| Reconciliation cron (ledger vs entitlement) | Medium | new cron route |

**Depends on:** Sprint A–D (quotas need real counts)

---

### Sprint F — Admin hardening REAL

| Task | Risk | Files |
|------|------|-------|
| Zod/input validation on all `/api/admin/*` mutations | Medium | admin API routes |
| Audit log UI for `atlas_admin_logs` | Low | new admin page |
| Remove dev localStorage admin bypass documentation | Low | `middleware.ts`, docs |
| Cross-tenant write audit on companies admin | Medium | `api/admin/companies/route.ts` |

**Depends on:** Sprint E (billing actions audited)

---

### Sprint G — Documents (library + OCR persistence)

| Task | Risk | Files |
|------|------|-------|
| Persist OCR results to `atlas_documents` | Medium | `documents/page.tsx` |
| Supabase Storage for file blobs | High | new upload flow |
| Migrate supplier invoices to Supabase | Medium | new migration + repo |
| Beta badge remains on OCR tab until Storage hardened | — | UI |

**Depends on:** Sprint D (invoice linking)

---

### Sprint H — Comptabilité + Rapports

| Task | Risk | Files |
|------|------|-------|
| Wire journal to `atlas_accounting_entries` CRUD | Medium | `atlas-accounting-repository.ts`, page |
| Auto-post from paid invoices (optional) | High | new service |
| Rapports: aggregate from real invoice/accounting data | Medium | `rapports/page.tsx` |
| Keep BETA badge until PCG validation exists | — | UI |

**Depends on:** Sprint D, G

---

### Sprint I — RH + IR unification

| Task | Risk | Files |
|------|------|-------|
| Wire RH page to `atlas_employees` CRUD | Medium | `rh/page.tsx`, repo |
| Merge IR calculator with employee master | Medium | `ir/page.tsx` |
| CNSS export persistence (optional table) | Medium | migration |
| BETA badge until payroll engine exists | — | UI |

**Depends on:** Sprint G

---

### Sprint J — Fiscal simulators (TVA, IS)

| Task | Risk | Files |
|------|------|-------|
| TVA: read from `atlas_invoices` by period | Medium | `tva/page.tsx` |
| IS: link to accounting entries | Medium | `is/page.tsx` |
| Clear disclaimers — not DGI submission | — | UI copy |
| BETA until official filing integration | — | — |

**Depends on:** Sprint H

---

### Sprint K — Client portal rebuild

| Task | Risk | Files |
|------|------|-------|
| Replace PIN demo with magic-link auth | High | `client/page.tsx` |
| RLS policies for client-scoped invoice read | High | migration |
| Invitation flow from factures page | Medium | new API |
| Remove `ClientPortalDemo.tsx` from production path | Low | flags |

**Depends on:** Sprint D

---

### Sprint L — AI tier (Assistant, Agents, OCR polish)

| Task | Risk | Files |
|------|------|-------|
| `ATLAS_AI_REQUIRE_AUTH=true` enforced in prod config | Low | env + `ai-auth-server.ts` |
| Chat session persistence table | Medium | migration |
| Agents: remove fake stats; show real task counts or honest empty | Low | `agents/page.tsx` |
| Assistant overlay: server validation on executor actions | Medium | `assistant-executor.ts` |
| Keep BETA badges on all AI surfaces | — | `atlas-beta-surfaces.ts` |

**Depends on:** Sprint D (executor writes real entities)

---

### Sprint M — Automations (new subsystem)

| Task | Risk | Files |
|------|------|-------|
| Define job queue schema | High | new migrations |
| Wire agent cards to real scheduled tasks | High | new service |
| Rate limits via Redis/Upstash | Medium | infra |

**Depends on:** Sprint L  
**Status target:** Move from BROKEN → BETA (not REAL until workflow engine proven)

---

## Safest conversion order (summary)

```text
Auth (done)
  → Companies (Sprint A) ← START HERE
  → Profiles/Settings (B)
  → Clients (C)
  → Invoices (D)
  → Billing entitlements (E)
  → Admin (F)
  → Documents (G)
  → Comptabilité + Rapports (H)
  → RH + IR (I)
  → TVA + IS (J)
  → Client portal rebuild (K)
  → AI tier polish (L)
  → Automations (M)
```

**Parallel-safe (after Sprint A):** Global search client index, Onboarding server prefs, Referral payout — low coupling.

**Do not parallelize:** Sprint E (billing) with Sprint D (invoices) — quota wiring touches both.

---

## Production risks by sprint

| Sprint | Risk | Mitigation |
|--------|------|------------|
| A | Company create blocked if entitlement misconfigured | Feature flag `ATLAS_STRICT_COMPANY_LIMITS`; staging first |
| D | Invoice numbering collisions | UUID ids (already); defer sequential numbers |
| E | Users lose access during entitlement migration | Read-only mode; run sync script before cutover |
| G | Storage costs / upload abuse | Size limits, MIME whitelist, signed URLs |
| K | Client portal auth complexity | Phased: read-only invoices first |
| L | AI cost spike | Rate limits + plan quotas from Sprint E |

---

## What we explicitly will NOT do

- Hide sidebar modules (nav stays full per `atlas-app-nav.ts`)
- Replace BETA modules with fake "REAL" labels
- Big-bang rewrite of all repositories in one PR
- Remove stabilized admin audit, subscription sync, or middleware guards
- Enable client portal demo in production by default

---

## Verification commands

```bash
# Production build (required each sprint)
npm run build

# Staging smoke (manual)
# 1. NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase
# 2. Create → refresh → verify Supabase row
# 3. Second user RLS check
# 4. Confirm no atlas_* localStorage writes on module under test
```

---

## Related documents

| Document | Purpose |
|----------|---------|
| `REAL_MODULE_CHECKLIST.md` | 10-gate per-module scorecard |
| `SUBSCRIPTION_SOURCE_OF_TRUTH_FINAL.md` | Billing entitlement rules |
| `STABILIZATION_ROADMAP.md` | Prior stabilization sprints |
| `CRITICAL_BACKEND_GAPS.md` | P0 backend gaps |
| `REAL_VS_FAKE_MATRIX.md` | Quick shippable reference |
| `PRODUCTION_READINESS.md` | Env vars, deployment checklist |

---

*Generated: 2026-05-28 · Build verified green · No code changes in this pass — roadmap only*
