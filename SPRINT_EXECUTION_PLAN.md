# ZAFIRIX PRO — Sprint execution plan

Execution mode: **stabilize in place** — no redesign, no feature expansion until P0 gates pass. Sprints are **2-week** cadence suggestions; adjust to team velocity.

---

## Guiding priorities

| Tier | Focus |
|------|--------|
| **P0** | Security, auth, admin, tenant isolation, invoices persistence, subscription architecture |
| **P1** | Payments, PDFs, companies/clients, logging, API validation (Zod) |
| **P2** | AI stabilization, OCR pipeline, analytics, performance |

---

## Sprint 0 — Gatekeeping (3–5 days)

**Outcome:** Safe baseline for staging.

- [ ] Confirm `npm run build` + env validation script (add CI check for forbidden env vars).  
- [ ] Feature-flag **`/client`** off in production (or remove nav links).  
- [ ] Verify Paddle webhook **requires** secret in prod.  
- [ ] Document active company loading path (Supabase-only target).

**Exit:** `PRODUCTION_DEPLOYMENT_CHECKLIST.md` section 1–3 green on staging.

---

## Sprint 1 — Auth, profiles, core entities (2 weeks)

**Theme:** Persistence + tenant context.

- [ ] Active `company_id` from Supabase on: `settings`, `rh`, `juridique`, `consultant`, `etude-projet` (remove localStorage reads for company context in prod paths).  
- [ ] Clients + companies + invoices: UI error surfaces on repo failures (no silent empty).  
- [ ] SSR-safe Supabase client split (`MULTI_TENANT_SECURITY_REPORT.md`).  
- [ ] Middleware: verify no onboarding redirect loops (manual QA matrix).

**Exit:** Cross-device QA for company + client + invoice CRUD.

---

## Sprint 2 — Admin + API hardening (2 weeks)

**Theme:** Trust in operations.

- [ ] Shared `assertAdmin` + audit log on all mutating `/api/admin/*`.  
- [ ] Add **Zod** to admin POST routes + payment routes (`API_VALIDATION_MATRIX.md`).  
- [ ] Remove / neuter **localStorage admin** in production builds.  
- [ ] Replace owner-email-only bootstrap with `profiles.role`.

**Exit:** External review of admin audit trail sample.

---

## Sprint 3 — Subscriptions + payments (2 weeks)

**Theme:** One source of truth.

- [ ] Implement `SUBSCRIPTION_ARCHITECTURE_PLAN.md` trigger or transactional sync.  
- [ ] Migrate pending checkout state off localStorage.  
- [ ] Reconciliation job: Paddle subscription vs `subscriptions` row (nightly).

**Exit:** Paid test user survives refresh + device change with correct plan.

---

## Sprint 4 — Documents + storage (2 weeks)

**Theme:** Real files.

- [ ] Supabase Storage buckets + RLS policies tied to `user_id` / `company_id`.  
- [ ] Virus scan policy (provider or upload-to-scan-service).  
- [ ] Documents UI uses signed URLs only.

**Exit:** Upload → metadata row → download works after relogin.

---

## Sprint 5 — AI / OCR beta hardening (2 weeks)

**Theme:** Safe scaling.

- [ ] Per-tenant quotas server-side; cost metrics.  
- [ ] Whisper/TTS size/time limits + unified rate limiter.  
- [ ] Optional background queue for large docs.

**Exit:** `AI_FEATURES_STATUS.md` “GA gaps” reduced with explicit “won’t do yet” list for legal.

---

## Continuous

- Weekly RLS review on new migrations.  
- Dependency updates with `npm audit` gate.

---

## Cross-references

- `STABILIZATION_ROADMAP.md` (if present) — align naming; this file is execution-focused.  
- `TECHNICAL_DEBT_MASTER.md` — link PRs when closing TD-* items.
