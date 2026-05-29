# ZAFIRIX PRO — Execution Plan (Safe Private Beta)

**Source of truth:** `AUDIT_REPORT.md`, `PRODUCTION_READINESS.md`, `SECURITY_ISSUES.md`, `TECH_DEBT.md`, plus this file’s linked plans.

**Scope:** No new product features — hardening, labeling, documentation, and build verification only.

---

## P0 blockers (before inviting paying or sensitive-data clients)

| ID | Item | Owner action |
|----|------|----------------|
| P0-1 | **Dual subscription tables** (`subscriptions` vs `atlas_subscriptions`) — entitlement drift | Follow `SUBSCRIPTION_SOURCE_OF_TRUTH.md` (decision + migration plan; **no code migration in this sprint**). |
| P0-2 | **RLS vs admin JWT** mismatch on some policies (`SECURITY_ISSUES.md` S3) | Supabase policy review + align with `isAtlasAdminUser` or route all admin writes through service role only. |
| P0-3 | **Service role** on many routes — blast radius | Input validation audit; MFA on admin accounts; optional IP allowlist for `/api/admin/*`. |
| P0-4 | **Hardcoded owner email** (`atlas-admin-access.ts`) | Move to env; document rotation. |
| P0-5 | **Apply all migrations** including `atlas_admin_logs` | Staging → prod order; verify RLS. |
| P0-6 | **`ATLAS_AI_ALLOW_ANON`** must be **unset/false** in any beta/prod host | Prevents anonymous AI cost/abuse. |
| P0-7 | **OCR / documents** — no durable file store | Labeled **Bêta** in UI (`documents/page.tsx`); do not sell as archive/compliance until Storage ships. |

---

## P1 before sale (first revenue / broader beta)

| ID | Item |
|----|------|
| P1-1 | Unified **entitlement resolver** (server): `profiles.plan` + one subscription table + explicit Paddle path. |
| P1-2 | **Webhook idempotency** + structured logging (replace `console.*` on hot paths). |
| P1-3 | **Redis/Upstash** (or equivalent) for AI + anonymous endpoint rate limits. |
| P1-4 | **Admin audit** on every mutating `/api/admin/*` route (extend beyond subscription activate). |
| P1-5 | **Sentry** + alert on 5xx for `/api/*` and auth failures. |
| P1-6 | **localStorage removal** for business truth — execute phases in `LOCALSTORAGE_REMOVAL_PLAN.md`. |

---

## P2 after beta (quality, scale, DX)

| ID | Item |
|----|------|
| P2-1 | Normalize `atlas_companies.company_json` where reporting needs it. |
| P2-2 | Split oversized pages (`juridique`, `rh`, `documents`) for maintainability. |
| P2-3 | Generated Supabase TypeScript types; remove `as any` in admin chain. |
| P2-4 | Performance budgets + list virtualization where needed. |
| P2-5 | Next.js **middleware → proxy** migration when framework path is clear. |

---

## Related artifacts (this delivery)

| File | Purpose |
|------|---------|
| `SUBSCRIPTION_SOURCE_OF_TRUTH.md` | Canonical table recommendation + migration plan (no migration executed). |
| `API_SECURITY_MATRIX.md` | Route-by-route auth / ownership / service-role notes. |
| `LOCALSTORAGE_REMOVAL_PLAN.md` | Every `localStorage` touchpoint + removal phases. |
| `SAFE_BETA_MODE_PLAN.md` | What to hide, label, or show to pilot clients. |

---

## What must be **disabled** or **not claimed** now

- **Anonymous AI** (`ATLAS_AI_ALLOW_ANON`).  
- Any claim that **OCR output** or **uploaded files** are **durably archived** on your servers (not implemented — no `storage.from` in repo).  
- **Paddle card checkout** as “live” — `/api/paddle/checkout` returns **501** until all Paddle env vars are set; **no in-repo UI** currently calls this route (grep verified); keep it that way until configured.  
- **Usage widget** as billing enforcement — it remains **indicative only** (local counters); badge updated to **Bêta · estimé** (not a billing meter).

---

## What can **remain visible** (with honest labels)

- **Manual Morocco payment** flow (DB-backed when Supabase on) — with “pending / admin activation” copy already on payment UI.  
- **Invoices / clients / documents (library)** when Supabase + RLS are correct — core CRM.  
- **Dashboard** fiscal disclaimer + indicative KPIs (already adjusted in prior work).  
- **TVA / comptabilité** as **simulation / bêta** (banners).  
- **Pricing / payment** pages — card/CMI steps already show “à venir” / disabled confirm; keep **manual** as primary paid path for Morocco beta.

---

## Next exact sprint (1–2 weeks, suggested order)

1. **Day 1–2:** Read `API_SECURITY_MATRIX.md` + fix any **quick** auth gaps (do not refactor entire admin).  
2. **Day 2–3:** Supabase staging: apply migrations, run RLS checklist from `SECURITY_ISSUES.md` S3/S9.  
3. **Day 3–4:** Implement **subscription canonical decision** from `SUBSCRIPTION_SOURCE_OF_TRUTH.md` (design + tickets only if no migration yet).  
4. **Day 4–5:** `LOCALSTORAGE_REMOVAL_PLAN.md` **phase 1** — stop writing usage/subscription cache for new sessions in prod (feature-flag or server reads only).  
5. **Day 5+:** Webhook idempotency spike; Sentry dashboards.  
6. **Continuous:** `npm run build` on every merge.

---

## Build

Run: `npm run build` (required gate — see CI or local after edits).
