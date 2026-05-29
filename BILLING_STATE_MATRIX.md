# Billing State Matrix — ZAFIRIX PRO (Sprint 2)

**Scope:** Subscription truth, profile cache, integration ledger, and writers/readers touched in Sprint 2.

## Stores

| Store | Role after Sprint 2 | Authority |
|-------|---------------------|-----------|
| `public.atlas_subscriptions` | **Canonical entitlement** (plan_id, status, start_date, end_date, metadata) | **Yes** — gates product access via client providers + dates |
| `public.profiles` (`plan`, `status`) | **Denormalized cache** for UX, admin lists, middleware | **No** — recomputed from atlas on all entitlement writes + admin plan path |
| `public.subscriptions` | **Integration ledger** (Paddle mirror + Morocco manual queue: pending_manual → active) | **Partial** — billing ops + Paddle history; not used alone for feature entitlement |

## Write paths (post–Sprint 2)

| Flow | Tables written | Profile sync |
|------|------------------|--------------|
| Paddle `subscription.*` webhook | `subscriptions` + upsert `atlas_subscriptions` (by `metadata.paddle_subscription_id`) | `syncProfileEntitlementFromAtlas` |
| Paddle cancel | `subscriptions` + cancel matching atlas rows | per affected user |
| Trial claim API | `atlas_subscriptions` (trial) | sync |
| Admin manual Morocco activate | `subscriptions` + `atlas_subscriptions` | sync |
| Admin payment-request activate | `atlas_subscriptions` | sync (service role) |
| Admin PATCH user `plan` | Cancels effective atlas rows, may insert commercial row, then | sync |

## Read paths (representative)

| Consumer | Primary read |
|----------|--------------|
| `manual-subscription-context.tsx` | `subscriptions` (pending_manual) + `atlas_subscriptions` (trial/active) for `hasAtlasEntitlement` |
| `/subscription` page | `atlas_payment_requests`, `atlas_subscriptions`, `subscriptions` (pending manual) |
| Middleware | `profiles.status` (suspended gate), `profiles.role` (admin) |
| Admin users API | `profiles` |

## Drift scenarios prevented

| Before | After |
|--------|-------|
| Paddle active in `subscriptions`, no atlas row | Webhook upserts atlas + syncs profile |
| Manual activate: atlas row without profile plan | sync after insert |
| Admin sets `profiles.plan` without atlas | `applyAdminProfilePlanToEntitlements` rewrites atlas then sync |
| Subscription page used localStorage as cache in Supabase mode | localStorage writes skipped when Supabase data is enabled |

## localStorage

| Key | Production + Supabase |
|-----|----------------------|
| `atlas_pending_subscriptions` / `atlas_active_subscriptions` | **Not written** when `isAtlasSupabaseDataEnabled()` (no billing authority in browser) |
