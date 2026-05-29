# Subscription Source of Truth — FINAL (Sprint 2)

**Project:** ZAFIRIX PRO  
**Decision date:** 2026-05-16 (Sprint 2 implementation)

## Single source of truth

**Entitlement (what the product should enforce):**  
→ **`public.atlas_subscriptions`**, evaluated as:

- Rows with `status` ∈ (`trial`, `active`)
- **And** `current_date` (UTC calendar) within `[start_date, end_date]` inclusive  
- Paid access: `plan_id <> 'free-trial'` and `status = 'active'`  
- Trial access: `plan_id = 'free-trial'` and `status` ∈ (`trial`, `active`)

When multiple paid rows are effective, the resolver prefers **higher commercial tier** (see `paidTierRank` in `app/lib/atlas-subscription-sync.ts`), then latest `end_date`.

## Denormalized cache (not a second truth)

**`profiles.plan`** — coarse commercial bucket for admin UI and fast reads:

| `atlas_subscriptions.plan_id` | `profiles.plan` |
|---------------------------------|-----------------|
| `free-trial` (effective trial) | `free` |
| `starter`, `growth`, `pro` | `pro` |
| `business`, `advanced` | `vip` |
| `enterprise` | `enterprise` |
| No effective entitlement | `free` (plan only; status unchanged unless entitlement grants `active`) |

**`profiles.status`** — account lifecycle. Sprint 2 rules:

- Effective paid or trial entitlement → may set `status` to `active` (never overrides `suspended`).
- Expired / none → **does not** auto-demote `status` to `pending` (avoid accidental lockouts).

## Integration ledger

**`public.subscriptions`** remains the **Paddle + manual Morocco queue** store:

- Webhooks and manual flows **continue** to write here for finance/support visibility.
- **Entitlement** for the app is still derived from **`atlas_subscriptions`**, not from `subscriptions.status` alone.

## Reasoning (short)

- `atlas_subscriptions` already anchors trials, payment-request activation, referrals, and cron.
- It supports **time bounds**, required for expired/downgraded users.
- `subscriptions` lacks universal `start_date` / `end_date` semantics for all channels; widening its schema would duplicate atlas.

## Implementation module

`app/lib/atlas-subscription-sync.ts`

- `syncProfileEntitlementFromAtlas` — recompute profile from atlas (service role in API routes).
- `applyAdminProfilePlanToEntitlements` — admin plan PATCH → cancel effective rows + optional insert + sync.
- `upsertPaddleAtlasSubscription` / `cancelPaddleAtlasSubscription` — Paddle ↔ atlas ↔ profile.

## Supersedes

Operational truth for engineering is this document. Historical analysis remains in `SUBSCRIPTION_SOURCE_OF_TRUTH.md`.
