# Atlas OS / ZAFIRIX PRO — Full Production Audit

**Method:** Source-code review (no runtime assumptions).  
**Stack:** Next.js 16, React 19, Supabase (PostgREST + Auth), Paddle hooks, Anthropic/OpenAI for AI.

---

## 1. Critical issues

| # | Issue | Evidence |
|---|--------|----------|
| C1 | **Two subscription models** — `public.subscriptions` (Paddle/manual legacy paths) vs `public.atlas_subscriptions` (Morocco manual activation, trials, admin stats). Risk of **desync** and wrong entitlements. | `app/api/webhooks/paddle/route.ts` → `subscriptions`; `app/api/admin/subscriptions/activate/route.ts` → `atlas_subscriptions`; `app/api/admin/revenue-overview/route.ts` reads **both**. |
| C2 | **Hardcoded owner email** in repo for admin bypass | `app/lib/admin/atlas-admin-access.ts` — `ATLAS_OWNER_EMAIL_LOWER` constant. |
| C3 | **localStorage** still used for companies hub, usage caps, payment pending queues, onboarding prefs, funnel buffer, admin **dev** role | `grep localStorage` across `app/` (see `TECH_DEBT.md`). |
| C4 | **Usage / plan enforcement** largely **client + localStorage** (`atlas-usage-limits.ts`) — not billing-grade. | `app/lib/atlas-usage-limits.ts` — `readJson` / `writeJson` to `localStorage`. |
| C5 | **No Supabase Storage** integration found for binary uploads — OCR sends content to `/api/ai`; PDFs generated **client-side** with jsPDF. | `grep` for `storage.from` → **no matches**; `app/documents/page.tsx` — `analyzeImage` → fetch `/api/ai`; `app/lib/atlas-invoice-pdf.ts` — `jsPDF`. |
| C6 | **Paddle checkout** returns **501** when env incomplete — paying users can hit dead end. | `app/api/paddle/checkout/route.ts` lines 49–59. |
| C7 | **Webhook** logs to `console.info` only; **no idempotency store**; narrow event set. | `app/api/webhooks/paddle/route.ts`. |
| C8 | **RLS vs admin:** Some policies reference JWT `app_metadata.role = admin` while app also grants admin via **`profiles.role`** and owner email — **policy drift** if JWT claim not set. | e.g. `20260430193000_atlas_saas_subscriptions_payments.sql` admin policies on `atlas_payment_requests` vs `isAtlasAdminUser` reading `profiles`. |

---

## 2. Fake / demo implementations

- **TVA / IS / IR pages:** In-memory or static demo data; banners added for TVA/compta but modules remain **simulation** (see `app/tva/page.tsx`, `app/is`, `app/ir`).
- **Comptabilité journal lines:** Seeded demo `ecritures` in component state (`app/comptabilite/page.tsx`).
- **Companies / settings / signup / subscription / payment clients:** Heavy **`atlas_companies` / `atlas_company` in localStorage** when not fully on Supabase-backed flows.
- **Admin dashboard (local backend):** Reads pending subscriptions from **localStorage** when `NEXT_PUBLIC_ATLAS_DATA_BACKEND !== 'supabase'` and local admin enabled (`AdminDashboardClient.tsx`).
- **Funnel local buffer:** `app/lib/atlas-funnel-local-buffer.ts` — localStorage.
- **Rapports / étude / RH PDFs:** Client-generated templates — **not** statutory filings.

---

## 3. Security risks

- **Service role key** in many `/api/admin/*` and cron routes — any bug = **full DB**; must stay server-only (verified: not in `NEXT_PUBLIC_*`).
- **Owner email bypass** — single compromised inbox = admin access.
- **Anonymous AI** if `ATLAS_AI_ALLOW_ANON=true` — public cost sink (`app/lib/ai-auth-server.ts`).
- **In-memory rate limits** — per instance, reset on deploy (`app/lib/ai-rate-limit.ts`, `app/lib/payment-rate-limit.ts`).
- **Cron** protected by `CRON_SECRET` — weak/missing secret = abuse (`app/api/cron/email-lifecycle/route.ts`).
- **Search API** requires Bearer but relies on **RLS** for isolation — correct if RLS complete on all queried tables (`app/api/search/route.ts`).

---

## 4. Missing backend logic

- Unified **subscription state machine** across Paddle + manual + `profiles.plan`.
- **Webhook idempotency** and full Paddle lifecycle coverage.
- **Server-side file virus scan / size quotas** for uploads (OCR path).
- **Durable blob storage** for invoices/contracts with signed URLs.
- **Entitlement API** consumed by all gated mutations (companies, invoices, AI quotas).
- **Admin audit** on every mutating admin route (partial: `atlas_admin_logs` + one activate path).

---

## 5. Database inconsistencies

- **`subscriptions`** vs **`atlas_subscriptions`** — different schemas and writers (see C1).
- **`profiles.plan` / `profiles.role`** vs subscription tables — app must define **single source of truth** for “what user can do.”
- **`atlas_companies.company_json`** — flexible blob; harder to enforce invariants than normalized columns.

---

## 6. Production blockers

1. Migrations applied + RLS verified on **staging** Supabase matching app queries.  
2. **Paddle env** complete or checkout **disabled in UI** until configured.  
3. **Remove or gate** any path that sells “DGI filing / legal certainty” without human review.  
4. **SERVICE_ROLE** rotation + least-privilege review.  
5. **Sentry** (`SENTRY_DSN`) + log aggregation — `@sentry/nextjs` installed with **legacy peer** for Next 16; monitor compatibility.

---

## 7. Legal / compliance risks

- **Tax / accounting UI** must stay labeled simulation until certified integrations exist (partially addressed on dashboard/TVA/compta).  
- **AI outputs** (consultant, juridique, OCR) — professional liability if sold as advice; API returns `safetyNotice` on `/api/ai` — **UI must surface it** everywhere.  
- **GDPR / Morocco Law 09-08:** localStorage analytics IDs, funnel buffer — privacy policy must disclose; subprocessors (Anthropic, OpenAI, Paddle).  
- **Consumer protection:** Misleading KPIs = regulatory risk (mitigated on home dashboard in recent changes; audit other pages).

---

## 8. What is safe to sell **now** (narrow)

Sell as **pilot / B2B tool** under a written agreement that states:

- Invoicing/clients/documents **when** `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase`, migrations applied, and RLS verified — **REAL** core CRM layer.  
- **Not** sold as: DGI filing, audit-ready accounting, or lawyer-reviewed documents.

---

## 9. What must be disabled **immediately** (if charging broad B2C today)

- `ATLAS_AI_ALLOW_ANON=true` in any production environment.  
- Marketing or in-app copy implying **official** DGI/CNSS filing from generated XML/PDF.  
- **localStorage** paths for **subscription / payment / company** truth if production build could ever hit `local` backend (production forces `supabase` in `atlas-data-source.ts` — verify hosting env does not break Supabase URL/keys).

---

## 10. Priority roadmap

| Phase | Focus |
|-------|--------|
| **P0 (weeks 1–2)** | Unify subscription + `profiles.plan`; admin audit on all mutations; remove remaining silent failures; complete Paddle env or hide checkout. |
| **P0** | RLS audit + JWT admin policy alignment with `isAtlasAdminUser`. |
| **P1** | Redis/Upstash rate limits; Sentry dashboards; webhook idempotency table. |
| **P1** | Supabase Storage for uploads; virus/size limits server-side. |
| **P2** | Normalize `company_json`; performance budgets; caching strategy for read-heavy lists. |

---

## Feature × classification (summary)

| Feature area | Class | Notes |
|--------------|-------|--------|
| Auth (Supabase session + middleware) | **REAL** | When env + cookies correct |
| Private route gate (prod) | **REAL** | `middleware.ts` + `atlasDataBackend()` |
| Admin gate (profiles / owner / JWT) | **PARTIAL** | Works; hardcoded owner; policy drift risk |
| Invoices/clients/documents/payments CRUD (Supabase mode) | **PARTIAL→REAL** | Repos fail-closed on list errors; writes need RLS verification |
| Companies list (Supabase) | **PARTIAL** | JSON blob model; UI still mixes localStorage |
| Search API | **PARTIAL** | REAL pattern; **BROKEN** if tables/RLS missing |
| Paddle checkout | **PARTIAL** | **BROKEN** until env complete (501) |
| Paddle webhook | **PARTIAL** | Signature OK if secret set; limited events |
| Manual Morocco subscriptions | **PARTIAL** | DB-backed; ops-heavy |
| Usage limits widget | **MOCK** | localStorage |
| TVA/IS/IR | **MOCK** | Simulation |
| Comptabilité journal | **MOCK** | Demo lines + partial invoice KPIs |
| OCR documents | **PARTIAL** | AI extraction REAL; **no durable file store** |
| PDF (invoices, rapports, RH) | **PARTIAL** | REAL files; client-side; not “official” |
| AI consultant/juridique | **PARTIAL** | REAL LLM; requires human verification |
| Whisper / TTS | **PARTIAL** | Session + rate limit; OpenAI cost |
| Referral / analytics / funnel | **PARTIAL** | REAL if tables + service role present |
| Onboarding prefs | **MOCK/PARTIAL** | localStorage |

---

## Related documents

- `PRODUCTION_READINESS.md` — env, deploy, ops  
- `SECURITY_ISSUES.md` — threat-oriented detail  
- `TECH_DEBT.md` — code-level debt and inconsistencies  

Also see existing reports: `PRODUCTION_READINESS_REPORT.md`, `CRITICAL_BACKEND_GAPS.md`, `REAL_VS_DEMO_MATRIX.md` (may overlap).
