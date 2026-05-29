# ZAFIRIX PRO — Real Module Checklist

**Purpose:** Repeatable acceptance criteria for every module conversion.  
**Rule:** A module is **REAL** only when **all 10 items** pass in production (`NODE_ENV=production`, `atlasDataBackend() === 'supabase'`).

---

## The 10 production gates

| # | Gate | Pass criteria |
|---|------|---------------|
| 1 | **Supabase persistence** | All authoritative data lives in Supabase tables or Auth; no localStorage/demo seeds on the production path |
| 2 | **CRUD operations** | Create, read, update, delete (where applicable) work end-to-end and survive refresh |
| 3 | **Ownership checks** | Writes scoped to authenticated `user_id`; `company_id` validated when entity is company-scoped |
| 4 | **Company isolation** | User A cannot read/write User B data; RLS verified + app-layer guards where needed |
| 5 | **API validation** | Server routes validate input (types, bounds, enums); client-only paths use repository guards |
| 6 | **Error handling** | Fail closed on DB errors; user-visible message; no silent fallback to demo data |
| 7 | **Loading states** | Initial fetch, mutations, and empty fetches show loading — not flash of wrong content |
| 8 | **Safe empty states** | Zero rows → helpful empty UI, not demo seeds or fake KPIs |
| 9 | **Refresh persistence** | Hard refresh + new browser session shows same data from Supabase |
| 10 | **Production-safe behavior** | No demo flags, mock PINs, hardcoded fiscal numbers, or AI-as-official-advice without BETA badge |

---

## Per-module scorecard

Legend: ✅ pass · ⚠️ partial · ❌ fail · — not applicable

### Tier 1 — Critical business

| Module | Status | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|--------|--------|---|---|---|---|---|---|---|---|---|---|
| **Auth** (login, signup, reset) | **REAL** | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Profiles / Settings** | **STABILIZING** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| **Companies** | **STABILIZING** | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| **Clients** | **STABILIZING** | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| **Invoices (Factures)** | **STABILIZING** | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| **Billing** (subscription, payment) | **STABILIZING** | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| **Admin** | **STABILIZING** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |

### Tier 2 — Operational

| Module | Status | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|--------|--------|---|---|---|---|---|---|---|---|---|---|
| **Comptabilité** | **BETA** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ |
| **Rapports** | **BETA** | ❌ | ❌ | — | — | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| **RH** | **BETA** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| **Juridique** | **BETA** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| **Documents** | **STABILIZING** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |

### Tier 3 — Advanced / AI

| Module | Status | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|--------|--------|---|---|---|---|---|---|---|---|---|---|
| **Assistant IA** (consultant) | **BETA** | ❌ | — | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| **Agents IA** | **BETA** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| **OCR / Documents IA** | **BETA** | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ | ⚠️ |
| **Automations** | **BROKEN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ❌ | ❌ |

### Supporting surfaces

| Module | Status | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|--------|--------|---|---|---|---|---|---|---|---|---|---|
| **Dashboard** | **STABILIZING** | ⚠️ | — | — | ⚠️ | — | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| **TVA** | **BETA** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| **IS Fiscal** | **BETA** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| **IR / Salaires** | **BETA** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| **Étude de projet** | **BETA** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ❌ | ⚠️ |
| **Client portal** | **BROKEN** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| **Onboarding** | **STABILIZING** | ❌ | — | — | — | — | ⚠️ | ✅ | ✅ | ❌ | ✅ |
| **Global search** | **STABILIZING** | ✅ | — | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| **Referral** | **STABILIZING** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ |

---

## Status definitions

| Status | Meaning |
|--------|---------|
| **REAL** | All 10 gates pass; safe to sell as production SaaS for that scope |
| **STABILIZING** | Supabase wired; dual localStorage paths, partial validation, or incomplete UI integration remain |
| **BETA** | Functional prototype; AI advisory, simulators, or in-memory state — visible with BETA badge, not sold as filing/compliance |
| **BROKEN** | Demo-only or non-functional under default production config |

---

## Missing capability matrix (by module)

### Auth — REAL

| Gap type | Detail |
|----------|--------|
| Missing backend | Profile row sync on signup (likely external DB trigger) |
| Missing DB | `profiles` migration not in repo — verify in Supabase project |
| Missing API | Email verification policy endpoint / resend UX |
| Missing validation | Rate limits on auth endpoints |
| Missing persistence | — |
| Missing ownership | — |

### Profiles / Settings — STABILIZING

| Gap type | Detail |
|----------|--------|
| Missing backend | User profile editor (name, phone, locale) |
| Missing DB | Dedicated `profiles` columns for preferences vs company JSON |
| Missing API | Server route for profile update with validation |
| Missing validation | IF/ICE/RC fiscal identifier format checks |
| Missing persistence | Settings saves company fields, not user profile |
| Missing ownership | Active company switch not validated server-side |

### Companies — STABILIZING

| Gap type | Detail |
|----------|--------|
| Missing backend | Plan slot enforcement from `atlas_subscriptions`, not localStorage |
| Missing DB | Normalized columns vs `company_json` blob |
| Missing API | Optional REST layer for integrations |
| Missing validation | Create/delete company quota server-side |
| Missing persistence | localStorage fallback on Supabase error in repository |
| Missing ownership | App-layer `company_id` ownership beyond RLS |

### Clients — STABILIZING

| Gap type | Detail |
|----------|--------|
| Missing backend | Balance reconciliation with invoices/payments |
| Missing DB | Full-text search index |
| Missing API | Server CRUD routes (currently client Supabase) |
| Missing validation | Duplicate client detection, email/ICE format |
| Missing persistence | localStorage fallback on error |
| Missing ownership | `company_id` required on all writes |

### Invoices — STABILIZING

| Gap type | Detail |
|----------|--------|
| Missing backend | Server-sequenced invoice numbering |
| Missing DB | Immutable audit trail (`atlas_invoice_events`) |
| Missing API | Server-side total validation |
| Missing validation | Line item totals, tax rates |
| Missing persistence | localStorage fallback; usage limits from localStorage |
| Missing ownership | `company_id` + `client_id` cross-check |

### Billing — STABILIZING

| Gap type | Detail |
|----------|--------|
| Missing backend | `getActivePlan()` in `atlas-usage-limits.ts` reads localStorage |
| Missing DB | Reconciliation between `subscriptions` ledger and `atlas_subscriptions` |
| Missing API | CMI card gateway; expanded Paddle webhook events |
| Missing validation | Manual payment amount vs catalog price |
| Missing persistence | localStorage pending/active subscriptions in dev paths |
| Missing ownership | Payment requests scoped to requesting user only |

### Admin — STABILIZING

| Gap type | Detail |
|----------|--------|
| Missing backend | Audit log UI for `atlas_admin_logs` |
| Missing DB | — |
| Missing API | Validation on all admin mutation routes |
| Missing validation | Input schemas on mark-paid, activate, reject |
| Missing persistence | Dev localStorage admin role bypass |
| Missing ownership | Cross-tenant write review on companies admin |

### Comptabilité — BETA

| Gap type | Detail |
|----------|--------|
| Missing backend | `upsertAtlasAccountingEntry`; wire page to `atlas_accounting_entries` |
| Missing DB | Supplier invoices Supabase table + repo |
| Missing API | Accounting CRUD routes |
| Missing validation | PCG balance checks, debit/credit equality |
| Missing persistence | Journal entries are React `useState` seeds |
| Missing ownership | Company-scoped entries |

### Rapports — BETA

| Gap type | Detail |
|----------|--------|
| Missing backend | Aggregate from invoices, accounting, TVA |
| Missing DB | Report snapshots table (optional) |
| Missing API | Server PDF generation |
| Missing validation | Period bounds, company scope |
| Missing persistence | All PDF data hardcoded |
| Missing ownership | Company-scoped report generation |

### RH — BETA

| Gap type | Detail |
|----------|--------|
| Missing backend | Wire to `atlas_employees` CRUD |
| Missing DB | Payroll run history, CNSS export logs |
| Missing API | Payroll calculation endpoints |
| Missing validation | Employee statutory fields |
| Missing persistence | Generated docs only; no employee master on page |
| Missing ownership | Company-scoped employees |

### Juridique — BETA

| Gap type | Detail |
|----------|--------|
| Missing backend | Template versioning, approval workflow |
| Missing DB | Legal act status tracking |
| Missing API | Structured validation on AI output before save |
| Missing validation | Required clauses per act type |
| Missing persistence | AI drafts saved to documents — OK |
| Missing ownership | Company context on all saves |

### Documents — STABILIZING

| Gap type | Detail |
|----------|--------|
| Missing backend | Supabase Storage for file blobs |
| Missing DB | `atlas_supplier_invoices` Supabase migration |
| Missing API | Upload size/type limits, virus scan hook |
| Missing validation | MIME type, max size |
| Missing persistence | OCR results in-memory; supplier invoices localStorage-only |
| Missing ownership | Document linked to company + user |

### Assistant IA / Agents / OCR — BETA

| Gap type | Detail |
|----------|--------|
| Missing backend | Chat history persistence; real agent task queue |
| Missing DB | `atlas_ai_sessions`, `atlas_agent_runs` (proposed) |
| Missing API | Server action validation for assistant-executor |
| Missing validation | Prompt injection guards, output schema |
| Missing persistence | Ephemeral chat; OCR not saved |
| Missing ownership | Tenant-scoped AI audit log |

### Automations — BROKEN

| Gap type | Detail |
|----------|--------|
| Missing backend | Entire workflow engine |
| Missing DB | Job queue tables |
| Missing API | Trigger/webhook system |
| Missing validation | — |
| Missing persistence | — |
| Missing ownership | — |

### Client portal — BROKEN

| Gap type | Detail |
|----------|--------|
| Missing backend | Magic-link or client auth |
| Missing DB | Client-facing RLS policies |
| Missing API | Invitation + scoped invoice read |
| Missing validation | PIN replaced with secure auth |
| Missing persistence | Hardcoded demo data |
| Missing ownership | Per-client invoice visibility |

---

## Verification procedure (run before marking REAL)

```text
1. Set NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase on staging
2. Log in as User A → create entity → hard refresh → entity persists
3. Log in as User B → confirm User A data invisible (RLS)
4. Disconnect network mid-save → confirm error UI, no localStorage write
5. Check browser Application tab → no new keys in atlas_* localStorage for that flow
6. Run npm run build → green
7. Manual admin smoke on mutation routes used by module
```

---

## Cross-cutting blockers (all modules)

These must be resolved during Tier 1 stabilization — they block REAL status for multiple modules:

1. **localStorage fallback on Supabase errors** in `*-repository.ts` files
2. **`atlas-usage-limits.ts`** reads plan/usage from localStorage, not `atlas_subscriptions`
3. **`requireEntityOwner()`** checks auth only — no `company_id` validation
4. **Dual subscription tables** — entitlement resolver exists (`atlas-subscription-sync.ts`) but not wired to all UI gates
5. **`profiles` table** — used in middleware but migration not in repo

---

*Last verified: 2026-05-28 · Build: `npm run build` green (Next.js 16.2.3)*
