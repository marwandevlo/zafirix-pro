# ZAFIRIX PRO — Production Readiness Report

**Audit type:** Security, persistence, payments, AI, legal exposure — **not** UI polish.  
**Date context:** Codebase audit of `atlas-os` (Next.js + Supabase + Paddle hooks).

---

## Executive summary

The codebase is a **credible product shell** with **real Supabase integration paths** and **real admin APIs**, but large parts of the **tenant-facing fiscal and accounting experience remain prototype-grade**. Several subsystems **silently fall back to browser localStorage** when Supabase errors occur, which is **unacceptable for paying customers** because it creates **split brain**, **no audit trail**, and **data loss on device change**.

**Verdict:** **Not production-grade SaaS** for regulated outcomes (tax, legal, payroll) without a **phased hardening program** and **contractual positioning** that matches reality.

---

## Architecture reality

| Layer | Readiness |
|-------|-----------|
| **Frontend** | Rich; many pages are **state-in-component** demos |
| **API routes** | Mix of **authenticated** admin routes and **optional-auth** AI |
| **Database** | Migrations exist for SaaS entities; **runtime depends on deployment** |
| **File storage** | Not centrally abstracted in this audit; documents table ≠ durable blob strategy |
| **Observability** | Minimal; webhook logs to console |
| **Multi-tenant isolation** | Depends on **RLS** + correct client usage |

---

## What is genuinely production-oriented today

1. **Supabase SSR middleware pattern** — session gate for private routes when `atlasDataBackend() === 'supabase'`.  
2. **Admin surface** — Bearer + `isAtlasAdminUser` + service role for cross-user operations (when key present).  
3. **Paddle webhook skeleton** — signature verification when secret set; upsert to `subscriptions`.  
4. **Search API** — Intends to query real tables with user JWT (good pattern).  
5. **Referral / funnel / analytics** — Server routes exist; production value depends on tables + privacy policy.

---

## What blocks “production SaaS” status

1. **Dual persistence** (`localStorage` vs Supabase) on core entities — **integrity risk**.  
2. **Fiscal modules** (TVA example) — **in-memory** demo data + fake XML channel.  
3. **AI auth default** — permissive unless `ATLAS_AI_REQUIRE_AUTH=true` (see `app/lib/ai-auth-server.ts`).  
4. **No unified billing ledger** tying **profiles.plan** ↔ **subscriptions** ↔ **entitlements** with tests.  
5. **Client-generated “official-looking” PDFs** without workflow, versioning, or e-signature.

---

## Recommended production phases

**Phase A — Data truth (P0)**  
Single write path per entity; remove prod localStorage fallback; migrations applied; RLS verified.

**Phase B — Billing (P0)**  
One payment rail end-to-end; webhook idempotency; reconciliation job.

**Phase C — Compliance (P1)**  
DPAs, Morocco data residency decisions, retention, export/delete, access logs.

**Phase D — Product honesty (P0)**  
In-app “Simulation” vs “Production” badges; remove misleading KPIs.

---

## Cross-references

- **Feature-level classification:** `FAKE_FEATURES_REPORT.md`  
- **Technical gaps:** `CRITICAL_BACKEND_GAPS.md`  
- **Money + law:** `PAYMENT_AND_LEGAL_RISKS.md`  
- **Matrix:** `REAL_VS_DEMO_MATRIX.md`
