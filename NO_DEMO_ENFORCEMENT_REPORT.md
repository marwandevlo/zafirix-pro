# NO DEMO ENFORCEMENT REPORT — ZAFIRIX PRO

**Date:** 2026-05-28  
**Scope:** Full SaaS enforcement pass — remove demo/mock/fake business behavior in production.

---

## Executive summary

Production (`NODE_ENV=production`) now forces Supabase as the data backend, blocks localStorage business persistence, and blocks routes that relied on mock/static/in-memory business data. Demo seeds were removed from core CRM modules. Comptabilité journal entries are persisted via `atlas_accounting_entries`.

---

## Fake / demo items found

| Location | Issue | Action taken |
|----------|-------|--------------|
| `app/comptabilite/page.tsx` | 6 hardcoded journal lines (Client Alpha, etc.) | **Removed** — wired to `listAtlasAccountingEntries` + `upsertAtlasAccountingEntry` |
| `app/comptabilite/page.tsx` | "Brouillon · non audité" banner over real KPI data | **Removed** misleading banner |
| `app/clients/page.tsx` | `seedClients` (Société Alpha, Entreprise Beta) | **Removed** — empty list until user creates clients |
| `app/factures/page.tsx` | 3 seed invoices (Alpha, Beta, Gamma) | **Removed** — loads only from repository |
| `app/companies/page.tsx` | `defaultCompanies` (3 fake SARL/SA) | **Removed** — empty until user creates company |
| `app/tva/page.tsx` | In-memory demo factures + DGI simulation | **Blocked in production** via `isDemoFeatureBlocked('tva_simulation')` |
| `app/rapports/page.tsx` | Static PDF tables (Ahmed Benali, 2 400 MAD TVA, etc.) | **Blocked in production** via `reports_static_pdf` |
| `app/agents/page.tsx` | Fake agent stats (12 done, "Il y a 2 heures") | **Blocked in production** via `agents_mock` |
| `app/etude-projet/page.tsx` | Wizard with localStorage + non-persisted dossier | **Blocked in production** via `etude_projet_wizard` |
| `app/ir/page.tsx` | 3 hardcoded employees | **Removed** — empty list, user adds rows |
| `app/client/ClientPortalDemo.tsx` | Mock portal, PIN 1234, fake invoices | **Disabled by default** — requires `NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true` |
| `app/page.tsx` | "TVA (simulation)" KPI, simulation/bêta banner | **Updated** — stabilization copy + real invoice KPIs |
| `app/lib/atlas-data-source.ts` | localStorage backend in dev | **Unchanged** — production always `supabase` |
| `app/lib/atlas-runtime-guards.ts` | localStorage block only | **Extended** — demo feature IDs + production guard |
| Admin analytics/funnel | localStorage fallback label in dev | **Documented** — production uses Supabase APIs |
| `app/signup/page.tsx` | Demo seed on signup (dev + local backend) | **Pre-existing guard** — `allowDemoSeed` only in development |
| IS / Consultant / Juridique / RH / Documents | Calculator or AI-assisted, not fake persisted CRM | **Labeled** — BetaSurfaceBadge → "en cours de stabilisation" |

---

## Production guards added

**File:** `app/lib/atlas-runtime-guards.ts`

- `isDemoFeatureBlocked(featureId)` — returns `true` in production for mock routes
- `getDemoFeatureBlockedMessage()` — safe user-facing copy
- `blockHardcodedBusinessSeedInProduction()` — defense for future seeds
- `blockCriticalLocalStorageInProduction()` — existing, unchanged behavior

**UI:** `app/components/safety/ProductionBlockedSurface.tsx` — consistent blocked-state page with return link.

**Blocked feature IDs:**

- `tva_simulation`
- `reports_static_pdf`
- `agents_mock`
- `etude_projet_wizard`
- `client_portal_demo` (via sprint0 flags, not runtime guard list)

---

## What was removed

- Hardcoded journal entries in Comptabilité
- Client/invoice/company seed data
- IR demo employees
- Misleading "Brouillon · non audité" banner on Comptabilité (KPIs are real)
- Client portal auto-enable in non-production (was always on in dev)

---

## What was converted to real

- **Comptabilité journal** → `atlas_accounting_entries` (Supabase) / localStorage (dev only, blocked in prod)
- **Comptabilité KPIs** → already real (invoices + payments + supplier invoices) — unchanged logic
- **Dashboard CA KPI** → `formatMadAmountLabel` from real invoices

---

## Still blocked / needs backend (production)

| Module | Status in production |
|--------|---------------------|
| `/tva` | Blocked — needs invoice-linked TVA engine + DGI integration |
| `/rapports` | Blocked — needs reports from stored fiscal data |
| `/agents` | Blocked — needs real agent job queue + metrics |
| `/etude-projet` | Blocked — needs persisted project studies |
| `/client` | Blocked unless `NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true` |
| Grand-livre / Bilan tabs | Same journal data — no separate GL engine yet |
| `/is`, `/ir` | Available (calculator) — not official declarations; stabilization labels apply |
| Admin localStorage role | Dev-only with `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN=true` |

---

## Real flows preserved (not broken)

- Companies (Supabase CRUD)
- Profiles / auth
- Clients (Supabase + company scope)
- Documents OCR (Storage + API)
- Supplier invoices (DB + OCR pipeline)
- Comptabilité supplier KPIs + overdue alerts
- Factures + atlas_payments
- Subscriptions / Paddle / manual payments

---

## Build

`npm run build` — **passed** (Next.js 16.2.3, 75 routes).

---

## Verification steps

1. Set `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase` in `.env.local`
2. `npm run build && npm start`
3. `/comptabilite` — no demo journal lines; add entry persists after refresh
4. `/clients`, `/factures`, `/companies` — no auto-seeded entities on fresh account
5. `/tva`, `/rapports`, `/agents`, `/etude-projet` — show stabilization blocked message
6. `/client` — blocked unless demo env flag set
7. Dashboard — CA from real invoices; TVA shows "—" / en stabilisation
