# Phase 16 — Database Performance Audit

## Index coverage (existing)

| Table | Index | Purpose |
|-------|-------|---------|
| `atlas_usage_events` | `(workspace_id, feature_code, created_at)` | Quota counts |
| `atlas_workspace_subscriptions` | `workspace_id`, `status` | Billing lookup |
| `atlas_audit_logs` | company + created_at (Phase 10) | Audit queries |
| `atlas_invoices` | `company_id` partial (Phase 14 recovery) | Multi-company |

## Slow query risks

| Pattern | Risk | Recommendation |
|---------|------|----------------|
| Cabinet portfolio loop | N+1 health per company | Batch health API (future) |
| Usage count per feature | 8 sequential counts | Single RPC `count_usage_by_workspace` |
| Admin revenue aggregates | Full table scan | Materialized view monthly |
| Cross-company scans without `company_id` | High | Always filter by active company |

## Missing indexes (recommended)

```sql
-- Post feature freeze
CREATE INDEX IF NOT EXISTS idx_audit_logs_event
  ON public.atlas_audit_logs ((metadata->>'event'))
  WHERE metadata ? 'event';

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
  ON public.atlas_usage_events (user_id, created_at DESC);
```

## N+1 patterns in app

| Location | Issue | Priority |
|----------|-------|----------|
| `buildCabinetPortfolio` | Per-company health | Medium |
| `buildBillingUsageSummary` | Per-feature count loop | Low (8 max) |
| Document list + OCR status | Client-side batch | Low |

## Phase 16 actions

- Document only; no schema migration in this phase.
- Health metrics API aggregates usage in single query where possible.
