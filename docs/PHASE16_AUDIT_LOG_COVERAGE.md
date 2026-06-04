# Phase 16 — Audit Log Coverage Report

**Table:** `atlas_audit_logs`  
**Writer:** `logAuditEvent()` in `app/lib/atlas-audit-log.ts`

## Events tracked

| Event | Source | action | Status |
|-------|--------|--------|--------|
| Plan change | `atlas-billing-server` | reviewed | ✅ `plan_change` |
| Trial start | `atlas-billing-server` | created | ✅ `trial_start` |
| Quota violation | `atlas-feature-access` | reviewed | ✅ `quota_violation` |
| Company switch | `atlas-workspace-server` | reviewed | ✅ `company_switch` |
| Role assignment | `atlas-workspace-server` | created | ✅ `role_assignment` |
| Validation actions | `api/validation/records` | validated/rejected | ✅ |
| Document routing | `api/documents/[id]/route-to` | routed | ✅ |
| Bank reconciliation | `atlas-bank-server` | reviewed | ✅ |
| Payroll payslips | `api/payroll/payslips` | created | ✅ |

## AI interactions (separate table)

| Event | Table | Status |
|-------|-------|--------|
| Chat | `atlas_ai_interactions` | ✅ |
| Audit report | `atlas_ai_interactions` | ✅ |
| Executive summary | `atlas_ai_interactions` | ✅ |

## Gaps

| Event | Status | Recommendation |
|-------|--------|----------------|
| Export (PDF/Excel) | Partial | Add `export` action on download routes |
| Settings change | GAP | Log company profile updates |
| Login/logout | GAP | Supabase auth logs + optional app event |
| Billing usage read | N/A | Read-only; no audit required |

## Coverage score

- **Critical business events:** 85% covered
- **Security events:** 70% covered
- **Target post-freeze:** 95% critical path

## Phase 16 metering linkage

Usage events in `atlas_usage_events` complement audit logs for quota analytics; quota violations dual-logged to audit.
