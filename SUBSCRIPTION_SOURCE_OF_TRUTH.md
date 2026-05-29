# Subscription Source of Truth — Audit & Recommendation

**Status:** Analysis + recommendation only. **No database migration executed** in this task.

---

## 1. What exists today (verified from code)

### Table A: `public.subscriptions` (legacy / Paddle / some manual)

**Writers / readers (non-exhaustive):**

| Path | Behavior |
|------|-----------|
| `app/api/webhooks/paddle/route.ts` | `upsert` / `update` on Paddle events (`payment_method: paddle`, `paddle_subscription_id`). |
| `app/api/manual-subscription/route.ts` | Inserts `pending_manual` rows for authenticated user. |
| `app/api/admin/manual-subscriptions/*` | Admin lists / activates / rejects rows in `subscriptions`. |
| `app/api/admin/revenue-overview/route.ts` | Counts Paddle vs manual from `subscriptions`. |

**Role:** Best fit for **Paddle Billing** mirror (external subscription id, `user_email`, `plan` string, `status`).

---

### Table B: `public.atlas_subscriptions` (Morocco SaaS schema)

**Writers / readers (non-exhaustive):**

| Path | Behavior |
|------|-----------|
| `app/api/admin/subscriptions/activate/route.ts` | Inserts active row after `atlas_payment_requests` marked paid. |
| `app/api/trial/claim/route.ts` | Trial lifecycle. |
| `app/api/cron/email-lifecycle/route.ts` | Reads subscription windows. |
| `app/api/admin/dashboard-stats/route.ts` | Admin KPIs use `atlas_subscriptions`. |
| `app/api/admin/manual-subscriptions/activate/route.ts` | Inserts into `atlas_subscriptions` when activating manual flow. |
| `app/lib/atlas-referral-server.ts` | Reads/updates `atlas_subscriptions`. |

**Role:** Best fit for **in-app entitlement** (plan_id, start_date, end_date, link to `atlas_payment_requests`).

---

### Table C: `public.profiles`

**Fields:** `plan`, `role`, `status`, etc. (see `atlas-admin-profile-fields.ts`).

**Role:** UX and admin often treat **`profiles.plan`** as the user-facing “current plan.”

---

## 2. Problem

Three layers can disagree:

1. `subscriptions.status` / `plan` (Paddle + pending manual).  
2. `atlas_subscriptions.status` / `plan_id` / dates (Morocco + trials).  
3. `profiles.plan` (display / gating in UI).

**Risk:** User pays (Paddle or manual) but UI or limits use a **different** row → support incidents and compliance issues.

---

## 3. Recommendation — **ONE canonical source**

**Canonical row for “what access does this user have right now?”:**  
→ **`public.atlas_subscriptions`** (or a future narrow view `active_subscription` backed 100% by it).

**Rationale:**

- Already tied to **`atlas_payment_requests`** and **trial/cron** logic.  
- Has **`start_date` / `end_date`** suitable for time-bound access.  
- Admin dashboard stats already emphasize this table.

**Supporting roles (not duplicate sources of truth):**

| Store | Purpose |
|-------|---------|
| `subscriptions` | **Integration ledger** for Paddle + legacy manual queue until migrated. Treat as **ingestion**, not final entitlement. |
| `profiles.plan` | **Denormalized cache** of commercial plan for fast UI; must be **written only** from the same transaction / job that updates `atlas_subscriptions`. |

**Paddle specifically:** Webhook should eventually **stop** being the only writer to `subscriptions` for “active” truth — instead: webhook → **append-only event** + worker → upsert **`atlas_subscriptions`** + sync **`profiles.plan`**.

---

## 4. Migration plan (phased — **not executed here**)

### Phase 0 — Inventory (1–2 days)

- List every read of `subscriptions`, `atlas_subscriptions`, and `profiles.plan` in app + Edge functions.  
- Document which user journeys each powers (Paddle, manual Morocco, trial, admin override).

### Phase 1 — Read path convergence (low risk)

- Implement **one server module** `getEntitlements(userId)` that:  
  - Prefers **active** `atlas_subscriptions` row;  
  - Falls back to documented legacy rules only if no atlas row (temporary).  
- Point **new** code paths only through this helper.

### Phase 2 — Write path convergence (medium risk)

- On **Paddle webhook** `subscription.*` events: upsert **`atlas_subscriptions`** (status mapped) and set **`profiles.plan`**.  
- Keep writing **`subscriptions`** for backward compatibility **or** dual-write until Phase 3.

### Phase 3 — Deprecate `subscriptions` for entitlement (higher risk)

- Migrate historical Paddle rows into `atlas_subscriptions` (scripted backfill with `metadata.paddle_subscription_id`).  
- Stop UI/admin “active plan” reads from `subscriptions`.  
- Retain `subscriptions` as archive/audit **or** drop after retention policy.

### Phase 4 — DB constraints

- Partial unique index: **one active** `atlas_subscriptions` per `user_id` (business rule).  
- Foreign keys already reference `auth.users`.

---

## 5. Out of scope (this document)

- Actual SQL migrations / backfill scripts.  
- Paddle product catalog changes.  
- Pricing page copy (handled under `SAFE_BETA_MODE_PLAN.md` + execution rules).

---

## 6. Decision log

| Date | Decision |
|------|-----------|
| (this delivery) | **Canonical entitlement:** `atlas_subscriptions` (+ `profiles.plan` as cache). **Integration staging:** `subscriptions` until migrated. |
