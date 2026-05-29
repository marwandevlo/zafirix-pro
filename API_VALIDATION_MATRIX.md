# ZAFIRIX PRO — API validation matrix

**Convention:** Every critical route should implement: **Auth** → **Role / ownership** → **Schema validation** → **Business rules** → **Structured logging** → **Safe client error**.

**Current repo state (2026-05-11):** `grep` for `zod` under `app/api` returns **no matches**. Validation is manual (`typeof`, allowlists, UUID helpers). **Gap:** add `zod` dependency and shared schemas in `app/lib/api-schemas/*`.

---

## Legend

| Column | Values |
|--------|--------|
| Auth | `cookie` (SSR session), `bearer`, `cron_secret`, `webhook_sig`, `anon_ok` (public), `none` (should fix) |
| Admin | `isAtlasAdminUser` or service role server-only |
| Body schema | `zod` target / today `manual` |
| Rate limit | existing helper / recommended |

---

## Route matrix

| Route | Method | Auth today | Admin / role | Body schema | Ownership check | Rate limit | Notes |
|-------|--------|------------|--------------|-------------|-----------------|------------|-------|
| `/api/ai` | POST | Yes (`authenticateAiRequest`) | N/A | manual | N/A user-scoped | partial (`checkAiRateLimit`) | Add Zod for mode + max sizes. |
| `/api/whisper` | POST | verify | N/A | manual | N/A | recommend | Audio upload limits. |
| `/api/tts` | POST | verify | N/A | manual | N/A | recommend | |
| `/api/search` | GET | bearer | N/A | query `q` manual | RLS | recommend | Sanitize `q` length; ILIKE injection N/A but CPU bound. |
| `/api/paddle/checkout` | POST | bearer | N/A | manual | plan from catalog | recommend | |
| `/api/webhooks/paddle` | POST | signature | N/A | JSON manual | service role | N/A | Require secret prod. |
| `/api/payments/manual-request` | POST | bearer | user | manual enums | user_id from auth | yes | Promote body to Zod. |
| `/api/manual-subscription` | POST | verify | mixed | manual | verify | recommend | Read handler in full audit. |
| `/api/trial/claim` | POST | verify | user | manual | verify | recommend | |
| `/api/analytics/track` | POST | anon_ok | N/A | allowlist | N/A | yes | Good pattern; Zod optional. |
| `/api/funnel/track` | POST | anon_ok | N/A | manual | N/A | verify | |
| `/api/referral/*` | mixed | verify per route | user | manual | verify | recommend | |
| `/api/email/welcome` | POST | verify | N/A | manual | verify | recommend | |
| `/api/cron/email-lifecycle` | GET/POST | cron_secret | N/A | N/A | N/A | recommend IP allowlist at edge |
| `/api/admin/users` | GET/PATCH | bearer | admin + service for list | manual + helpers | admin | recommend | |
| `/api/admin/companies` | GET | bearer | admin | manual | admin | recommend | |
| `/api/admin/dashboard-stats` | GET | bearer | admin | n/a | admin | recommend | |
| `/api/admin/revenue-overview` | GET | bearer | admin | n/a | admin | recommend | |
| `/api/admin/funnel-stats` | GET | bearer | admin | n/a | admin | recommend | |
| `/api/admin/payment-requests` | GET | bearer | admin | n/a | admin | recommend | |
| `/api/admin/payments/mark-paid` | POST | bearer | admin | manual UUID | partial (updates by id) | recommend | Add audit log row. |
| `/api/admin/payments/reject` | POST | bearer | admin | manual | verify | recommend | |
| `/api/admin/manual-subscriptions/*` | POST | bearer | admin | manual | verify | recommend | |
| `/api/admin/subscriptions/activate` | POST | bearer | admin | manual | verify | recommend | |

---

## Typed responses

- Standardize JSON types in `app/lib/api-types/*.ts` (e.g. `AdminUserResponse`, `SearchResponse`).
- Never return raw `PostgrestError` stacks to clients.

---

## Zod adoption order (recommended)

1. All `/api/admin/*` POST bodies.  
2. `/api/payments/manual-request`, `/api/paddle/checkout`, `/api/manual-subscription`.  
3. `/api/ai` (mode, messages, attachments metadata).  
4. Referral + trial routes.

---

## Cross-reference

- `API_HARDENING_CHECKLIST.md` (existing sprint checklist).  
- `SECURITY_HARDENING_PLAN.md`
