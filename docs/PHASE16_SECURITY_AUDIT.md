# Phase 16 — Security Audit

**Date:** 2026-06-04  
**Scope:** Zafirix Atlas production SaaS (post Phase 15 billing foundation)

## Executive summary

Atlas enforces authentication at the middleware layer for all private routes and admin APIs. Phase 16 adds workspace-scoped permissions, server-side quota metering, rate limiting, health probes, Sentry, and error boundaries. Residual risks are documented below with severity and remediation.

## API surface

| Area | Auth | Authz | Risk | Remediation |
|------|------|-------|------|-------------|
| `/api/admin/*` | Session + JWT/profile admin | `requireAdmin` | Medium | ✅ Middleware + handler double gate |
| `/api/billing/*` | Session | Workspace owner/manager (change-plan) | Medium | ✅ Phase 16 `requireWorkspaceRole` |
| `/api/assistant/*` | Session | Company context + quotas | High → Medium | ✅ Metering + rate limits |
| `/api/documents/*` | Session/Bearer | Company access check on upload | High → Medium | ✅ `canAccessCompany` on register |
| `/api/roles` | Session | Manager+ for POST | Critical → Low | ✅ Phase 16 enforcement |
| `/api/analytics/track` | Public | N/A | Low | Rate limit at edge recommended |
| `/api/webhooks/paddle` | Secret header | N/A | Medium | Verify signature in handler |
| `/api/cron/*` | CRON_SECRET | N/A | Medium | Rotate secret quarterly |
| `/api/health` | Public | Read-only | Low | ✅ No sensitive data |

## Supabase & RLS

- Core tenant tables use `user_id` + Phase 14 `workspace_id` scoping.
- Billing tables (Phase 15) reference `atlas_workspaces` and `atlas_user_roles` in RLS policies.
- Service role used intentionally for audit insert, billing metering, admin aggregates — never exposed to client.

**Critical (pre-16):** POST `/api/roles` allowed any authenticated user. **Fixed:** manager+ workspace role required.

## Authentication & sessions

- Supabase SSR cookies with Bearer fallback for documents/mobile.
- Middleware returns JSON 401 for API routes (no HTML redirect loops).
- Pending users blocked from app routes until approved.
- **Medium:** `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` must remain `false` in production.

## Secrets

See `PHASE16_SECRET_AUDIT.md`. No secrets committed in repository; env-only configuration validated in `instrumentation.ts`.

## Uploads & AI

- Document upload: company permission + quota + rate limit (Phase 16).
- OCR: quota event `ocr_request` recorded server-side.
- AI chat/audit/executive: `ai_requests_limit` enforced before execution.
- **High (mitigated):** `ATLAS_AI_ALLOW_ANON` must not be enabled in production.

## Billing endpoints

- Usage read APIs authenticated; change-plan requires manager role.
- Client-side `atlas-billing-enforcement.ts` is UX-only; server is source of truth via `meterFeatureUsage`.

## Admin endpoints

- 14 admin API routes; all behind middleware admin gate + `requireAdmin` in handlers.
- Admin actions logged to `admin_logs` where applicable.

## Severity summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 1 | Remediated (roles POST) |
| High | 4 | 3 remediated, 1 monitor (anon AI flag) |
| Medium | 8 | Mitigated / documented |
| Low | 12 | Accepted |

## Remediation actions (completed in Phase 16)

1. ✅ `app/lib/atlas-permissions.ts` — role enforcement
2. ✅ `app/lib/atlas-rate-limit.ts` — workspace rate limits
3. ✅ `app/lib/atlas-usage-meter.ts` — server quota + usage events
4. ✅ `/api/health*` — observability probes
5. ✅ Sentry + error boundaries
6. ✅ `/admin/security` dashboard
