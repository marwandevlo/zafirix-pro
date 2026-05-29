# API Hardening Checklist

Use this as a **working** document while touching routes. Mark `[x]` when verified or fixed.

**Legend:** A = Auth required · O = Ownership / scope · V = Input validation · SR = Service role (justify) · RL = Rate limit

---

## Public / low-trust

| Route | A | O | V | SR | RL | Notes |
|-------|---|---|---|----|----|------|
| `POST /api/analytics/track` | anon | IP | allowlist + metadata cap | optional insert | yes | Service role for insert |
| `POST /api/funnel/track` | alias | | | | | Forwards to analytics |
| `POST /api/webhooks/paddle` | webhook secret | N/A | JSON parse | yes | N/A | Add idempotency (backlog) |
| `POST /api/referral/click` | anon | | code normalize | yes | yes | |
| `POST /api/cron/email-lifecycle` | CRON_SECRET | | | yes | N/A | Fail if secret missing in prod |

---

## Authenticated user

| Route | A | O | V | SR | RL | Notes |
|-------|---|---|---|----|----|------|
| `GET /api/search` | Bearer | RLS | query length | no | | Depends on RLS |
| `POST /api/ai` | session/cookie | | body types | no | yes | |
| `POST /api/whisper` | session | | file | no | yes | |
| `POST /api/tts` | session | | text len | no | yes | |
| `POST /api/paddle/checkout` | Bearer | | planId | no | | 501 if misconfigured |
| `POST /api/payments/manual-request` | Bearer | user row | plan/addon | no | yes | |
| `POST /api/manual-subscription` | Bearer | user match body | plan | yes | yes | Validates `user_id` mismatch |
| `POST /api/trial/claim` | Bearer | | | yes | | |
| `POST /api/email/welcome` | Bearer | self | | yes | | |
| `GET/POST /api/referral/*` | varies | | | often SR | | Review each handler |

---

## Admin (`/api/admin/*`)

| Route | A | O | V | SR | Notes |
|-------|---|---|---|----|------|
| `GET/PATCH /api/admin/users` | Bearer + admin | | UUID, allowed profile fields | yes | Sprint 2: stricter PATCH schema |
| `GET /api/admin/dashboard-stats` | admin | | | yes | |
| `POST .../subscriptions/activate` | admin | | paymentRequestId UUID | yes | Audit log on success |
| `POST .../payments/mark-paid` | admin | | | yes | Sprint 1: validate UUID refs |
| `POST .../payments/reject` | admin | | | yes | |
| `GET/POST .../manual-subscriptions/*` | admin | | | yes | |
| `GET .../companies` | admin | | | yes | |
| `GET .../revenue-overview` | admin | | | yes | |
| `GET .../funnel-stats` | admin | | | yes | |

**Sprint 1 admin action:** Add shared helpers `requireUuid(param)` and `clampString(s, max)`; apply to `mark-paid` + `reject` + `subscriptions/activate` if not already present.

---

## Hardening principles

1. **Reject unknown JSON keys** where mutation size is small (admin PATCH).  
2. **Never trust** `user_id` from body without equality check to JWT (pattern in `manual-subscription`).  
3. **503** when service role missing — avoid partial writes.  
4. **Structured logs** instead of `console.*` on admin + webhooks.

---

## Sign-off

| Phase | Owner | Date |
|-------|-------|------|
| Sprint 1 review | | |
| Staging pen-test | | |
