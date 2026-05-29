# ZAFIRIX PRO — REAL vs DEMO Matrix

**Related:** [Production readiness](PRODUCTION_READINESS_REPORT.md) · [Fake / demo features](FAKE_FEATURES_REPORT.md) · [Backend gaps](CRITICAL_BACKEND_GAPS.md) · [Payments & legal](PAYMENT_AND_LEGAL_RISKS.md)

**Legend**

- **REAL** — Suitable as production subsystem *if* env + DB + RLS are correctly deployed.
- **PARTIAL** — Works in lab; missing integrity, security, lifecycle, or ops hardening.
- **MOCK** — Demo / prototype / misleading if sold as final truth.
- **BROKEN** — Fails or unsafe under realistic production assumptions (misconfig, abuse, missing tables).

| Module / capability | Class | Notes |
|---------------------|-------|--------|
| Supabase Auth (login/session) | **REAL** | Industry-standard when configured |
| Middleware: login required (prod+supabase) | **REAL** | |
| Middleware: `/admin` gate | **PARTIAL** | Good intent; depends on `profiles` row + owner constants |
| `public.profiles` admin read/write | **PARTIAL** | **REAL** when schema + service role present |
| Companies (`atlas_companies` JSON) | **PARTIAL** | Persisted but blob model |
| Clients (`atlas_clients`) | **PARTIAL** | **BROKEN integrity** if localStorage fallback in prod |
| Invoices (`atlas_invoices`) | **PARTIAL** | Same fallback risk; PDF client-side OK |
| Payments (`atlas_payments`) | **PARTIAL** | Better error handling needed |
| Documents (`atlas_documents`) | **PARTIAL** | Fallback risk; file storage not fully audited here |
| Global search API | **PARTIAL** | **BROKEN** if tables/RLS missing |
| Dashboard invoice KPIs | **PARTIAL** | From invoices when data exists |
| Dashboard other KPIs | **MOCK** | Hardcoded TVA / declarations |
| TVA page | **MOCK** | In-memory + illustrative XML |
| IS / IR pages | **MOCK** | (Same class as TVA — prototype pattern) |
| Comptabilité | **MOCK** + **PARTIAL** | Fake journal; partial KPIs |
| Consultant / Agents AI | **PARTIAL** | Real model; **BROKEN security** if auth off |
| Juridique / RH outputs | **PARTIAL** | Real file generation; not legal truth |
| Étude de projet | **MOCK** | Spreadsheet-style + PDF |
| Rapports PDF | **MOCK** | Client templates |
| Subscription UI | **PARTIAL** | Mixed storage + DB |
| Paddle checkout API | **PARTIAL** | **BROKEN** until env complete (501) |
| Paddle webhooks | **PARTIAL** | Narrow event handling |
| Manual payment + admin activation | **PARTIAL** | Ops-heavy; needs fraud controls |
| Referral / funnel / analytics APIs | **PARTIAL** | **REAL** if tables exist |
| Usage / quotas | **MOCK** | localStorage / client — not billing-grade |
| Onboarding / pending flows | **PARTIAL** | Depends on deployment; not all in middleware snapshot |

---

## Minimum viable **REAL** SaaS scope (recommended)

**Include (ship as “v1 production”):**

1. Auth + `profiles` + **server-only** business writes for: **clients, invoices, documents metadata, payments** (no localStorage fallback in prod).  
2. Admin: user/plan/role management + audit log (add).  
3. Billing: **one** chosen path first — **either** Paddle **or** manual Morocco — fully documented + monitored webhooks / SOP.  
4. AI: **auth required** + quotas + logging.  
5. Support: error reporting (Sentry or similar).

**Explicitly exclude or label “Beta simulation”:**

- TVA / IS / IR “declaration” UX  
- Comptabilité journal as ledger of record  
- “Bank-ready” étude / rapport claims without human review product

---

## Must disable immediately (if charging money **today**)

- **Hardcoded** dashboard metrics that imply tax position.  
- **Any** marketing claiming DGI filing / legal validity from AI or client PDFs.  
- **Public** AI endpoint without auth in production (`ATLAS_AI_REQUIRE_AUTH` must be on).

---

## Can stay in **beta** (with clear labeling)

- Juridique / RH **draft** generators (with disclaimers + versioning).  
- Étude de projet **scenario calculator**.  
- Rapports as **internal management** exports (not statutory).  
- Agents as **non-destructive** assistants (read-only suggestions) until action pipeline is hardened.

---

## Safe for **real users** (narrow definition)

**Safe cohort:** pilot users under **written pilot agreement** stating:

- Not a tax filing / legal advice product for regulated outcomes.  
- Data may be incomplete; they maintain backups of critical documents.  
- Known modules are **simulations** unless explicitly named otherwise.

**Not safe:** mass-market **paid self-serve** without closing **P0** gaps in **CRITICAL_BACKEND_GAPS.md**.

---

## Document index

1. `PRODUCTION_READINESS_REPORT.md`  
2. `FAKE_FEATURES_REPORT.md`  
3. `CRITICAL_BACKEND_GAPS.md`  
4. `PAYMENT_AND_LEGAL_RISKS.md`  
5. `REAL_VS_DEMO_MATRIX.md` (this file)
