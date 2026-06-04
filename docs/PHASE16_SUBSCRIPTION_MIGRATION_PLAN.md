# Phase 16 — Subscription Model Cleanup Plan

## Current dual model

| Model | Table | Scope | Used by |
|-------|-------|-------|---------|
| Legacy | `atlas_subscriptions` | User | Trial claim, referrals, admin stats, Paddle |
| Workspace (Phase 15) | `atlas_workspace_subscriptions` | Workspace | Billing UI, quotas, `meterFeatureUsage` |

## Risk

- Quota enforcement uses workspace model; legacy table may show different plan in old UI (`/subscription`).
- Admin dashboards count `atlas_subscriptions` for revenue metrics.

## Migration plan (no payment changes)

### Phase A — Read path unification (done partially)

1. ✅ Billing APIs read `atlas_workspace_subscriptions`.
2. ⏳ Admin stats: add workspace subscription counts alongside legacy (future).
3. ⏳ `/subscription` page: redirect to `/billing`.

### Phase B — Write path

1. `trial/claim` → create workspace subscription instead of user subscription.
2. Paddle webhook → upsert workspace subscription by user's default workspace.
3. Referral extensions → workspace-scoped metadata.

### Phase C — Deprecation

1. Mark `atlas_subscriptions` read-only in app code.
2. SQL view `atlas_subscriptions_compat` mapping workspace → user for reporting.
3. Drop table after 90-day observation (Enterprise customers notified).

## Preferred model

**`atlas_workspace_subscriptions`** — aligns with multi-company, cabinet mode, and quota engine.

## No migration SQL in Phase 16

Documentation and app wiring only; zero-downtime migration scheduled post feature freeze.
