# REAL FEATURE MATRIX — ZAFIRIX PRO

Classification: **REAL** | **NEEDS REAL BACKEND** | **REMOVE/HIDE UNTIL REAL**

Last updated: 2026-05-28 (enforcement pass)

---

## Core platform

| Module | Route | Classification | Persistence | Notes |
|--------|-------|----------------|-------------|-------|
| Auth (login/signup/reset) | `/login`, `/signup`, … | **REAL** | Supabase Auth | Production-ready |
| User profile | `/settings`, `/api/profile` | **REAL** | Supabase | |
| Subscription / billing | `/subscription`, `/payment` | **REAL** | Paddle + manual flows + DB | Webhook guarded |
| Trial / usage limits | middleware + libs | **REAL** | Supabase + session | |
| Onboarding | `/onboarding` | **REAL** | Supabase prefs | |
| Referral | dashboard card + APIs | **REAL** | Supabase | |

---

## Business data (tenant)

| Module | Route | Classification | Persistence | Notes |
|--------|-------|----------------|-------------|-------|
| Companies | `/companies` | **REAL** | `atlas_companies` | Seed removed |
| Clients | `/clients` | **REAL** | `atlas_clients` | Company-scoped |
| Invoices | `/factures` | **REAL** | `atlas_invoices` | Seed removed |
| Payments | factures UI | **REAL** | `atlas_payments` | Graceful if table missing |
| Documents + OCR | `/documents` | **REAL** | Storage + `atlas_documents` | Multi-page OCR |
| Supplier invoices | documents + comptabilité | **REAL** | `atlas_supplier_invoices` | OCR pipeline |
| Comptabilité KPIs | `/comptabilite` | **REAL** | invoices + payments + supplier | |
| Comptabilité journal | `/comptabilite` | **REAL** | `atlas_accounting_entries` | Wired this pass |
| Grand-livre / Bilan | `/comptabilite` tabs | **NEEDS REAL BACKEND** | journal only | No separate GL engine |
| Links | juridique integration | **REAL** | `atlas_links` | |
| Employees | `/rh` | **REAL** (partial) | `atlas_employees` | AI chat stabilization |
| Projects | etude-projet (dev) | **NEEDS REAL BACKEND** | `atlas_projects` table exists | Page blocked in prod |

---

## Fiscal & declarations

| Module | Route | Classification | Notes |
|--------|-------|----------------|-------|
| TVA module | `/tva` | **REMOVE/HIDE UNTIL REAL** | Blocked in production; in-memory dev tool |
| IS calculator | `/is` | **NEEDS REAL BACKEND** | User-input calculator; not linked to ledger |
| IR / paie | `/ir` | **NEEDS REAL BACKEND** | Salary calculator; employees from user input |
| Rapports PDF | `/rapports` | **REMOVE/HIDE UNTIL REAL** | Blocked in production; static PDF data |
| Dashboard fiscal deadlines | `/` | **NEEDS REAL BACKEND** | Static calendar list; labeled indicatif |
| Dashboard TVA KPI | `/` | **NEEDS REAL BACKEND** | Shows "—" / stabilization |

---

## AI surfaces

| Module | Route | Classification | Notes |
|--------|-------|----------------|-------|
| Consultant IA | `/consultant` | **REAL** (provider-backed) | `/api/ai` + auth; stabilization badge |
| Juridique IA | `/juridique` | **REAL** (provider-backed) | Generates docs; human review required |
| Assistant overlay | global | **REAL** (provider-backed) | STT/TTS routes guarded |
| Documents OCR | `/documents` | **REAL** | OpenAI vision + Storage |
| Agents hub | `/agents` | **REMOVE/HIDE UNTIL REAL** | Blocked in production |
| Étude de projet | `/etude-projet` | **REMOVE/HIDE UNTIL REAL** | Blocked in production |

---

## Admin

| Module | Route | Classification | Notes |
|--------|-------|----------------|-------|
| Admin dashboard | `/admin/*` | **REAL** | Supabase service role + audit logs |
| Admin analytics | `/admin/analytics` | **REAL** | Supabase events in production |
| Admin funnel | `/admin/funnel` | **REAL** | Supabase in production |
| Local admin role | dev only | **REMOVE/HIDE UNTIL REAL** | `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` |

---

## Client-facing

| Module | Route | Classification | Notes |
|--------|-------|----------------|-------|
| Client portal | `/client` | **REMOVE/HIDE UNTIL REAL** | Demo opt-in only |
| Landing / pricing | `/landing`, `/pricing` | **REAL** | Marketing |

---

## Infrastructure guards

| Mechanism | Classification |
|-----------|----------------|
| `atlasDataBackend()` → supabase in production | **REAL** |
| `blockCriticalLocalStorageInProduction()` | **REAL** |
| `isDemoFeatureBlocked()` | **REAL** |
| `validateProductionConfiguration()` | **REAL** |
