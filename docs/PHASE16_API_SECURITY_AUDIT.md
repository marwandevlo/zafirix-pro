# Phase 16 — API Security Audit

**Routes audited:** 120+ under `app/api/`  
**Method:** Static review + middleware alignment

## Authentication coverage

| Pattern | Routes | Anonymous blocked |
|---------|--------|-------------------|
| Middleware session gate | All except public list | ✅ |
| Handler re-check | Billing, documents, assistant | ✅ |
| Bearer token | `/api/documents/*` | ✅ |
| Secret (cron/webhook) | 3 routes | ✅ |

## Public endpoints (intentional)

- `POST /api/analytics/track`
- `POST /api/funnel/track`
- `POST /api/webhooks/paddle`
- `GET/POST /api/cron/email-lifecycle` (CRON_SECRET inside)
- `GET /api/health`
- `GET /api/health/dependencies`

## Authorization gaps closed (Phase 16)

| Route | Before | After |
|-------|--------|-------|
| `POST /api/roles` | Any logged-in user | Manager+ on workspace |
| `POST /api/billing/change-plan` | Any logged-in user | Manager+ on workspace |
| `POST /api/documents/upload/register` | Session only | + company access + quota |
| `POST /api/payroll/runs` | Session only | + payroll_manager role + quota |

## Workspace / company ownership

- Company mutations verify `atlas_companies.user_id` or `atlas_user_roles` via `canAccessCompany`.
- Workspace billing operations use `ensureWorkspaceSubscription` + role checks.

## Rate limiting (429)

| Endpoint | Bucket |
|----------|--------|
| `/api/assistant/chat` | `ai_chat` |
| `/api/assistant/audit` | `ai_audit` |
| `/api/assistant/executive-summary` | `ai_executive` |
| `/api/documents/upload/register` | `document_upload` |
| `/api/documents/[id]/ocr/run` | `ocr` |
| Bank routing | `bank_import` |
| Payroll runs POST | `payroll_run` |

## Recommendations

1. Standardize on `requireAtlasSupabaseSession` across all new routes.
2. Add Zod validation per `API_VALIDATION_MATRIX.md` (future hardening).
3. Return stable error codes only in production (`{ error, code }`).
