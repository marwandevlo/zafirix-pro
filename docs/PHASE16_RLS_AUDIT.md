# Phase 16 — RLS Audit

Review of row-level security policies across Atlas tables. Status as of Phase 15/14 migrations.

## Legend

| Status | Meaning |
|--------|---------|
| OK | Policy enforces intended isolation |
| REVIEW | Partial isolation; app-layer also required |
| GAP | Missing or permissive policy |

## Core multi-tenant

| Table | Policy | Isolation | Risk | Status |
|-------|--------|-----------|------|--------|
| `atlas_workspaces` | owner + member select | Workspace | Low | OK |
| `atlas_user_roles` | own + workspace owner manage | User/workspace | Medium | OK |
| `atlas_companies` | user_id scoped | Company owner | Medium | REVIEW — workspace_id column added Phase 14 |
| `atlas_cabinet_clients` | workspace members | Cabinet | Low | OK |

## Billing (Phase 15)

| Table | Policy | Isolation | Risk | Status |
|-------|--------|-----------|------|--------|
| `atlas_subscription_plans` | authenticated read active | Public catalog | Low | OK |
| `atlas_plan_features` | authenticated read | Public catalog | Low | OK |
| `atlas_workspace_subscriptions` | owner FOR ALL + member SELECT | Workspace | Medium | OK |
| `atlas_usage_events` | workspace members FOR ALL | Workspace | Medium | OK |

## Documents & validation

| Table | Policy | Isolation | Risk | Status |
|-------|--------|-----------|------|--------|
| `atlas_documents` | user_id | User | Medium | REVIEW |
| `zafirix_routing_records` | user_id | User | Low | OK |
| `atlas_audit_logs` | user/company scoped | Company | Medium | OK |

## AI (Phase 13)

| Table | Policy | Isolation | Risk | Status |
|-------|--------|-----------|------|--------|
| `atlas_ai_context` | user_id | User | Low | OK |
| `atlas_ai_conversations` | user_id | User | Low | OK |
| `atlas_ai_anomalies` | user_id | User | Low | OK |
| `atlas_ai_interactions` | user_id | User | Low | OK |

## Banking & payroll (Phase 11)

| Table | Policy | Isolation | Risk | Status |
|-------|--------|-----------|------|--------|
| `zafirix_bank_statements` | user_id | User | Medium | REVIEW — optional table |
| `zafirix_bank_transactions` | user_id | User | Medium | REVIEW |
| `atlas_payslip_extractions` | user_id | User | Medium | OK |

## Legacy SaaS

| Table | Policy | Isolation | Risk | Status |
|-------|--------|-----------|------|--------|
| `atlas_subscriptions` | user scoped | User (legacy) | High | GAP — see subscription migration plan |
| `profiles` | own row | User | Low | OK |

## Recommendations

1. Align `atlas_companies` RLS with `workspace_id` membership (Phase 14 optional migration).
2. Deprecate user-scoped `atlas_subscriptions` in favor of `atlas_workspace_subscriptions`.
3. Run `20260602110300_phase14_optional_rls_later.sql` on production if banking tables exist.
4. No table should grant cross-tenant SELECT without workspace/user predicate — verified for Phase 15 billing tables.
