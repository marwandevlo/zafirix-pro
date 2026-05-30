# PRODUCTION STABILIZATION REPORT — ZAFIRIX PRO

**Phase:** 0 (environment) + 1 (clients hotfix + Anthropic runtime)  
**Date:** 2026-05-30 (updated after execution)  
**Production URL:** https://www.zafirixpro.com  
**Git `origin/main`:** `a1161c4` (Anthropic runtime fix) · clients fix `3c29f53`  
**Clients hotfix:** **merged to `main`** (fast-forward)

---

## Executive summary

| Area | Status | Action required |
|------|--------|----------------|
| Supabase schema (prod DB) | **PASS** — all verify checks green | None |
| Local env (dev) | All 6 required keys **SET** in `.env.local` | N/A for production |
| Vercel env | **Cannot verify from CLI** (`vercel` not installed) | Manual checklist below |
| Assistant IA (live Anthropic test) | **Not verified** (requires logged-in session) | Manual test after env confirm |
| Clients create buttons (production) | **FIX deployed** (`3c29f53` on `main`) | Verify on production after Vercel Ready |
| Anthropic / Consultant IA | **Code fix pushed** (`a1161c4`) | **Add `ANTHROPIC_API_KEY` in Vercel Production → redeploy** |
| Hotfix build | **PASS** | Done |

**No new feature sprints started** (Agents, TVA, Rapports, RH, IR, IS, Étude, Juridique).

---

## A) Vercel environment

### CLI limitation

`gh` and `vercel` CLIs are **not installed** on this machine. Production env vars must be confirmed in the **Vercel Dashboard** (cannot read values from here; secrets are never printed).

### Manual verification steps

1. Open [Vercel Dashboard](https://vercel.com) → your **zafirix-pro** project.
2. **Settings** → **Environment Variables**.
3. For **Production** (and Preview if you use preview smoke tests), confirm each row exists:

| Variable | Required value / notes | Verified here |
|----------|------------------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Local: SET — Vercel: **you confirm** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Local: SET — Vercel: **you confirm** |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role | Local: SET — Vercel: **you confirm** |
| `NEXT_PUBLIC_SITE_URL` | `https://www.zafirixpro.com` (no trailing slash) | Local: SET — **must not be `localhost` on Production** |
| `NEXT_PUBLIC_ATLAS_DATA_BACKEND` | `supabase` | Local: `supabase` — Vercel: **you confirm** |
| `ANTHROPIC_API_KEY` | Anthropic API key (server-only) | Local: SET — Vercel: **you confirm** |

4. **Recommended Production checks (not in minimal list but important):**
   - `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` → **unset** or `false`
   - `ATLAS_AI_ALLOW_ANON` → **unset** (do not enable in production)

5. If you **add or change** `ANTHROPIC_API_KEY` (or any env var): **Deployments** → latest **Production** → **Redeploy** (or push to `main` after merge).

### Production data backend (code)

Even if `NEXT_PUBLIC_ATLAS_DATA_BACKEND` is missing on Vercel, `app/lib/atlas-data-source.ts` forces **`supabase`** when `NODE_ENV === 'production'`. Setting the var explicitly is still recommended for clarity.

### Supabase schema (automated check)

```text
node scripts/verify-supabase-schema.mjs
→ ALL CHECKS PASSED (10 tables, payment_request columns, atlas-documents bucket)
→ backend: supabase
```

---

## B) Assistant IA / Consultant IA

### Route & auth

| Item | Detail |
|------|--------|
| Page | `/consultant` |
| API | `POST /api/ai` with `{ "type": "consultant", "message": "..." }` |
| Auth | `app/lib/ai-auth-server.ts` — session required unless `ATLAS_AI_ALLOW_ANON=true` |
| Key guard | Missing `ANTHROPIC_API_KEY` → HTTP **503**, code `ocr_not_configured`, message contains `ANTHROPIC_API_KEY missing` |

### Automated production probe (unauthenticated)

| Test | Result |
|------|--------|
| `GET /consultant` (no cookie) | Redirect to marketing `/landing` (middleware) |
| `POST /api/ai` (no cookie) | **405** on follow-up (middleware redirects anonymous API calls to `/landing`, which does not accept POST) |

This is **expected without login** — not proof that Anthropic fails.

### Live test result

| Criterion | Status |
|-----------|--------|
| Message sends | **Not tested** — needs authenticated browser session |
| Anthropic responds | **Not tested** |
| No `ANTHROPIC_API_KEY missing` | **Not tested** on production |

### Manual pass test (you)

1. Log in at https://www.zafirixpro.com/login  
2. Open https://www.zafirixpro.com/consultant  
3. Send: `Quelles sont les échéances TVA au Maroc ?`  
4. **Pass if:** assistant reply appears within ~30s, no error mentioning `ANTHROPIC_API_KEY missing`  
5. **If fail:** open DevTools → Network → `POST /api/ai` → note **status** and **response JSON** (`error`, `code`)

| HTTP status | Likely cause |
|-------------|----------------|
| 401 | Session expired — re-login |
| 503 + `ANTHROPIC_API_KEY missing` | Add key in Vercel Production → redeploy |
| 429 | Rate limit — wait and retry |
| 500 | Server error — check Vercel function logs |

### Root cause: `ANTHROPIC_API_KEY missing`

| Check | Finding |
|-------|---------|
| **Variable name** | `ANTHROPIC_API_KEY` (exact) — used in `app/lib/ai-auth-server.ts`, `app/api/ai/route.ts` |
| **Scope** | Server-only — must **not** use `NEXT_PUBLIC_` prefix |
| **Runtime** | Checked per request via `getAnthropicApiKey()` in `app/lib/anthropic-env.ts` |
| **Production logs** | `validateProductionConfiguration()` now **errors** if key missing on Node boot |
| **Vercel** | Key exists in **local** `.env.local` but is **not** injected into Vercel Production unless you add it there |

**Primary root cause:** `ANTHROPIC_API_KEY` is **not set (or not enabled for Production)** in the Vercel project environment. Local `.env.local` does not apply to Vercel deployments.

**Secondary (code, fixed in `a1161c4`):** Module-level `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` could read an empty value at build time. Client is now created **per request** with runtime `process.env['ANTHROPIC_API_KEY']`.

### Code fixes shipped (`a1161c4`)

- `app/lib/anthropic-env.ts` — runtime key read  
- `app/api/ai/route.ts` — lazy Anthropic client  
- `app/lib/ai-auth-server.ts`, `app/lib/atlas-ocr-invoice-server.ts` — use helper  
- `app/lib/atlas-production-config.ts` — log error if missing in production  
- `.env.example` — documents `ANTHROPIC_API_KEY` + `NEXT_PUBLIC_ATLAS_DATA_BACKEND`

### Required manual step (you)

1. Vercel → **Settings** → **Environment Variables**  
2. Add **`ANTHROPIC_API_KEY`** (same name), value = your Anthropic secret, scope = **Production** (and Preview if needed)  
3. **Redeploy** Production (Deployments → … → Redeploy) after `a1161c4` is Ready  
4. Log in → `/consultant` → send a test message

---

## C) Clients hotfix

### Branch & merge status

| Item | Value |
|------|-------|
| Branch | `hotfix-clients-buttons` |
| Clients fix commit | `3c29f53` — `Fix clients create buttons` |
| Merged to `main`? | **Yes** — fast-forward `c2d5f99` → `3c29f53` |
| Pushed | `git push origin main` succeeded |
| Follow-up commit | `a1161c4` — Anthropic runtime env read |

### Root cause (confirmed on `main`)

Create form JSX was inside `{!loading && clients.length > 0 ? ( ... )}`. With **zero clients**, `setShowForm(true)` ran but the form never mounted → buttons appeared dead.

### Fix on hotfix branch

- Form renders whenever `showForm` is true (independent of client count).
- Empty-state CTA hidden while form is open.
- No active company → visible message + link to `/companies`.

### Build

```text
npm run build on hotfix-clients-buttons → SUCCESS (79 routes, TypeScript OK)
```

### Deploy verification

Confirm in Vercel **Deployments** → Production is **Ready** on commit **`a1161c4`** (or at minimum **`3c29f53`** for clients-only).

### Production test checklist (clients — after `3c29f53` Ready)

Account with **active company** and **zero clients**:

- [ ] **Nouveau client** → create form visible  
- [ ] **Ajouter maintenant** (empty state) → same form  
- [ ] Fill name → **Ajouter** → client appears  
- [ ] Refresh page → client still listed  

Account with **no active company**:

- [ ] Amber banner + **Aller à Mes sociétés**  
- [ ] **Nouveau client** → red message: *Sélectionnez d'abord une société active…* (no silent no-op)

### Consultant test (after `a1161c4` + Vercel `ANTHROPIC_API_KEY`)

- [ ] `ANTHROPIC_API_KEY` set in Vercel **Production**  
- [ ] Production redeploy **Ready** on `a1161c4`  
- [ ] Logged-in message on `/consultant` returns Anthropic reply (not `ANTHROPIC_API_KEY missing`)

---

## D) Module audit matrix

**Legend**

- **REAL** — Supabase-backed in production; survives refresh when used as designed  
- **PARTIAL** — Works with gaps (ephemeral UI, mixed KPIs, no persistence, localStorage fallback in dev only)  
- **BLOCKED_STABILIZATION** — Intentionally blocked in production via `ProductionBlockedSurface`  
- **BROKEN** — Visible but core interaction fails on current production `main`

| Module | Route | Status | Notes |
|--------|-------|--------|-------|
| Dashboard | `/` | **PARTIAL** | Invoice KPIs from `listAtlasInvoices()`; fiscal `deadlines` array is **static** in `app/page.tsx` |
| Mes sociétés | `/companies` | **REAL** | `atlas_companies` + active company |
| Clients | `/clients` | **BROKEN** on prod `main` | Create form gating bug; **REAL after hotfix merge** |
| Assistant IA | `/consultant` | **PARTIAL** | Anthropic via `/api/ai`; chat **not persisted**; Beta badge |
| Agents IA | `/agents` | **BLOCKED_STABILIZATION** | `agents_mock` — fake stats in dev only |
| Documents IA | `/documents` | **REAL** | Upload, OCR API, `atlas_documents`, `atlas_supplier_invoices` |
| Comptabilité | `/comptabilite` | **PARTIAL** | KPIs from invoices/payments/supplier; journal uses `atlas_accounting_entries` |
| Factures | `/factures` | **REAL** | `atlas_invoices` / `atlas_payments` |
| Juridique | `/juridique` | **PARTIAL** | AI + `createDocument`; large client UI; disclaimer needed for legal use |
| Ressources humaines | `/rh` | **PARTIAL** | AI/doc generation; **does not use** `atlas_employees` on page — ephemeral |
| Étude de projet | `/etude-projet` | **BLOCKED_STABILIZATION** | `etude_projet_wizard` |
| Rapports | `/rapports` | **BLOCKED_STABILIZATION** | `reports_static_pdf` — hardcoded PDF amounts in dev |
| TVA | `/tva` | **BLOCKED_STABILIZATION** | `tva_simulation` — in-memory in dev |
| IS | `/is` | **PARTIAL** | Visible in prod; **React state only** — not blocked, not persisted |
| IR | `/ir` | **PARTIAL** | Visible in prod; in-memory payroll — not persisted |
| Abonnement | `/subscription` | **PARTIAL** | Supabase subscriptions + manual flow |
| Tarifs | `/pricing` | **REAL** | Marketing/pricing surface |
| Paramètres | `/settings` | **REAL** | Profile + company via Supabase |
| Admin | `/admin` | **REAL** | Owner/admin only; API + audit |

### Unauthenticated HTTP probe (production)

All private routes redirect to `/landing` when not logged in (middleware). This is **correct** — module UIs require login.

### Blockers fixed in this phase

| Blocker | Fix |
|---------|-----|
| *(none merged to production yet)* | Clients fix ready on branch `hotfix-clients-buttons` |

### Remaining blocked (by design until future sprints)

- Agents IA, TVA, Rapports, Étude de projet (`ATLAS_DEMO_FEATURE_IDS` in `app/lib/atlas-runtime-guards.ts`)

### Stabilization risk (visible but not blocked)

**IS** and **IR** (and **RH** data) appear functional but **do not persist** in production. Consider blocking or a “non enregistré” banner in a future stabilization pass (out of scope for Phase 0–1).

---

## E) Build result

| Branch | `npm run build` | Notes |
|--------|-----------------|-------|
| `hotfix-clients-buttons` (`3c29f53`) | **SUCCESS** | 2 optional Sentry “module not found” warnings (non-fatal) |
| `origin/main` (`c2d5f99`) | **SUCCESS** (prior session) | Same Sentry warnings |

---

## Next recommended sprint

**After Phase 0–1 complete:**

1. Confirm Vercel env (especially `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL=https://www.zafirixpro.com`).  
2. Merge + deploy **clients hotfix**; run clients checklist on production.  
3. Manual **Consultant IA** pass test (logged in).  
4. Then start **Sprint Agents** (first feature activation) — do not batch with TVA/Rapports.

---

## Phase 0–1 completion checklist (owner)

- [ ] Vercel Production env: all 6 variables confirmed  
- [ ] `ANTHROPIC_API_KEY` added on Vercel if missing → redeploy  
- [ ] PR `hotfix-clients-buttons` merged to `main`  
- [ ] Production deployment **Ready** on merge commit  
- [ ] `/clients` create flow verified on production  
- [ ] `/consultant` sends message and receives reply (logged in)  
- [ ] `node scripts/verify-supabase-schema.mjs` → ALL CHECKS PASSED (already green against prod DB from dev machine)

---

*Report generated during Production Stabilization Phase 0 + 1. No Agents/TVA/Rapports/RH/IR/IS/Étude/Juridique implementation performed.*
