# ZAFIRIX PRO — Critical Backend Gaps

Prioritized for **paying customers** and **incident response**.

---

## P0 — Data integrity & persistence

### G1. localStorage fallback on Supabase errors

**Where:** e.g. `atlas-invoices-repository.ts`, `atlas-clients-repository.ts`, `atlas-documents-repository.ts` (pattern: `if (error) return readFromLocalStorage()`).

**Gap:** Two sources of truth; **no merge strategy**; **no sync**; **GDPR nightmare** (data on device not in DPA scope if not disclosed).

**Fix:** In production, **fail closed** with user-visible error + support ID; optional **export** only.

### G2. Companies: JSON blob in `company_json`

**Gap:** Hard to query, index, migrate, or enforce invariants at DB level.

**Fix:** Normalize columns or JSON schema + DB constraints + migration tooling.

### G3. Missing tables / schema drift

**Symptom:** PostgREST “schema cache” / missing relation errors.

**Fix:** Migration CI gate; smoke test against staging Supabase on every deploy.

---

## P0 — Security

### G4. AI route authentication default

**File:** `app/lib/ai-auth-server.ts` — `ATLAS_AI_REQUIRE_AUTH` defaults **off**.

**Gap:** **Cost abuse**, **data exfiltration** if prompt can reach sensitive context, **reputation**.

**Fix:** Default **on** in production; verify Supabase JWT server-side (not length check).

### G5. Service role key blast radius

**Gap:** Single key bypasses RLS; any bug in admin route = **full DB**.

**Fix:** Separate **least-privilege** roles, admin audit log, IP allowlist for admin in prod.

### G6. Webhook coverage

**File:** `app/api/webhooks/paddle/route.ts` — limited event types.

**Gap:** Revenue drift vs Paddle; canceled subscriptions edge cases.

**Fix:** Idempotency table; full lifecycle; reconciliation cron.

---

## P1 — Billing & entitlements

### G7. `profiles.plan` vs `subscriptions` vs `atlas_subscriptions`

**Gap:** Multiple concepts without documented **source of truth** for app behavior (admin now uses profiles — good — but product features must align).

**Fix:** One **entitlement resolver** used everywhere; integration tests.

### G8. Paddle checkout 501 until env complete

**Gap:** Paying users hit dead end if ops forgot env.

**Fix:** Feature flag “payments enabled”; graceful UX; monitoring.

---

## P1 — Observability & ops

### G9. Console logging in webhooks / hot paths

**Gap:** No structured logs; hard to debug production.

**Fix:** Logger + request IDs + redaction.

### G10. No automated backup / restore drill documented in repo

**Gap:** RTO/RPO unknown.

---

## P2 — Domain correctness

### G11. No immutable audit trail for invoice/legal doc changes

**Gap:** Disputes.

**Fix:** Append-only `*_events` tables or event sourcing for legal/financial artifacts.

### G12. Rate limits only in-memory (`checkAiRateLimit`)

**Gap:** Resets per instance; weak under load.

**Fix:** Redis / Upstash + user plan quotas.

---

## Verification checklist (before “production” claim)

- [ ] No localStorage write path for invoices/clients/docs in prod build  
- [ ] `ATLAS_AI_REQUIRE_AUTH=true` in prod  
- [ ] All migrations applied; RLS smoke tests green  
- [ ] Paddle webhook + manual payment **both** reconciled to same ledger model  
- [ ] Admin actions logged  
- [ ] Pen test on `/api/admin/*` and `/api/ai`
