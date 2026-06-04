# Phase 19 — Billing Readiness

**Date:** 2026-06-04

---

## Plans

| Code | Name | GA status |
|------|------|-----------|
| FREE | Free / Trial | Active |
| STARTER | Starter | Active |
| PRO | Pro | Active |
| CABINET | Cabinet | Active |
| ENTERPRISE | Enterprise | Active |

Plans served via `/api/billing/plans` from `atlas_subscription_plans`.

---

## Quotas (features)

| Feature code | Enforced |
|--------------|----------|
| `documents_per_month` | Yes — meter |
| `ocr_limit` | Yes |
| `ai_requests_limit` | Yes |
| `companies_limit` | Yes |
| `users_limit` | Yes |
| `storage_limit_gb` | Partial |
| `bank_accounts_limit` | Yes |
| `payroll_limit` | Yes |

Enforcement: `meterFeatureUsage()` → 429 on exceed.

---

## Trials

| Item | Behavior |
|------|----------|
| Trial start | Workspace bootstrap |
| Trial days | Shown on `/billing` |
| Trial expired | `trialExpired` flag; upgrade CTA |
| Grace | Manual admin override available |

---

## Subscription lifecycle

```
signup → trial → active → (renewal | cancelled | expired | suspended)
```

| Event | Tracked |
|-------|---------|
| Plan change | `requireWorkspaceRole` + audit event |
| Manual payment | Admin approval flow |
| Paddle webhook | `/api/webhooks/paddle` (when enabled) |
| Usage | `atlas_usage_events` |

---

## GA checklist

- [x] Usage API `/api/billing/usage`
- [x] Plans API
- [x] Change-plan permission gate
- [x] Billing UI `/billing`
- [x] Admin billing `/admin/billing`
- [ ] Paddle production keys (when payments go live)
- [ ] Invoice PDF for subscriptions (post-GA)

**Verdict:** Billing foundation **ready for GA** (usage + trials); payment gateway activation is operational follow-up.
