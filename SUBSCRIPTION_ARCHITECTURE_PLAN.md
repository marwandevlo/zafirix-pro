# ZAFIRIX PRO — Subscription architecture plan

**Goal:** **One source of truth** for entitlement and billing state, consumed consistently by middleware-gated routes, APIs, and UI.

---

## Current state (observed)

| Source | Role | Risk |
|--------|------|------|
| `public.subscriptions` table | Paddle webhook upserts; manual flows | Partial duplicate with profile fields |
| `profiles.plan`, `profiles.status` | Admin user API; UX | Can drift from `subscriptions` |
| Paddle Billing | Checkout + webhooks | Depends on `custom_data.user_id`, `plan_id` |
| Manual payment requests | `atlas_payment_requests` (and related) | Admin marks paid → must sync plan |
| localStorage on `/subscription`, `/payment` | Cache / pending orders | Split brain |

---

## Target architecture

### Canonical layers

1. **Billing events (append-only):** `subscription_events` or reuse existing audit tables — Paddle + manual + admin overrides.  
2. **Current entitlement (derived):** materialized view or single function `get_entitlement(user_id)` reading latest active subscription row + manual overrides.  
3. **Profiles mirror (optional):** `profiles.plan` updated **only** by DB trigger from subscriptions table to keep admin UI fast — **never** updated solely from client.

### Rules

- **Writes:** only server (API routes, webhooks, cron) using service role or privileged RPC.  
- **Reads:** client reads through RLS-safe view or `profiles` snapshot.  
- **Webhooks:** idempotent upsert on natural key (`paddle_subscription_id`).  
- **Manual Morocco flow:** activating subscription must insert/update same `subscriptions` shape as Paddle for downstream code paths.

---

## Migration strategy (no data destruction)

1. Inventory all code paths that **read** plan (grep `plan`, `subscriptions`, `getAtlasPlanById`).  
2. Add DB trigger **or** transactional application helper: on `subscriptions` change → update `profiles.plan` / `status`.  
3. Backfill: one-time SQL to align `profiles` from latest `subscriptions` row per user.  
4. Remove duplicate “set plan” logic from scattered client components.  
5. Deprecate localStorage keys for plan (keep only ephemeral checkout session id if needed).

---

## Verification

- User with `subscriptions.status = active` always sees Pro features after hard refresh.  
- Cancelled Paddle subscription moves user to free tier within webhook latency + UI refetch.  
- Admin manual activation and Paddle activation produce **indistinguishable** rows from entitlement POV.

---

## References

- `supabase/migrations/20260430193000_atlas_saas_subscriptions_payments.sql`  
- `supabase/migrations/*subscriptions*`  
- `app/api/webhooks/paddle/route.ts`  
- `REAL_VS_FAKE_MATRIX.md`
