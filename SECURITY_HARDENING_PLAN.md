# ZAFIRIX PRO — Security hardening plan

Aligned with global rules: no auth bypass, no global RLS off, no silent swallow of critical DB errors in admin flows.

---

## P0 — Before commercial launch

### 1. Authentication & session

- [ ] Standardize **one** Supabase client pattern per runtime:
  - **Middleware / Route handlers:** `@supabase/ssr` with cookies **or** explicit Bearer (already used on many admin APIs).
  - **Client components:** `createBrowserClient` from `@supabase/ssr` (evaluate replacing plain `createClient` in `app/lib/supabase.ts` to avoid subtle session bugs).
- [ ] Audit **`requireSupabaseUser()`**: it uses the singleton from `app/lib/supabase.ts`. Document that repository functions are **browser-oriented** unless called from a context where that client has a session.
- [ ] Eliminate production reliance on **`NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN`** and **`localStorage` admin role** (`LOCAL_ADMIN_ROLE_KEY`). Keep behind `NODE_ENV === 'development'` only; add startup warning in CI if the env var is set in staging/prod.

### 2. Authorization

- [ ] Replace long-term dependency on **hardcoded owner email** (`ATLAS_OWNER_EMAIL_LOWER` in `atlas-admin-access.ts`) with **DB role** + break-glass env for emergencies only.
- [ ] Ensure **every** `/api/admin/*` handler calls **`isAtlasAdminUser`** (or service-role-only internal routes that are not exposed to browsers).
- [ ] Add **resource-level checks** where service role bypasses RLS: admin mutations must verify target row exists and belongs to expected tenant before update.

### 3. API hardening

- [ ] Introduce **Zod** (or equivalent) for all POST/PUT/PATCH bodies on critical routes — see `API_VALIDATION_MATRIX.md`.
- [ ] Normalize error responses: **`{ error: code }`** in production; log details server-side (`atlas-server-log` / Sentry).
- [ ] Apply **rate limiting** pattern from `manual-request` and `analytics/track` to AI routes (`/api/ai`, `/api/whisper`, `/api/tts`) — partial exists for AI; verify.

### 4. Webhooks & secrets

- [ ] **Paddle:** require `PADDLE_WEBHOOK_SECRET` in production (fail closed or monitored alert if missing).
- [ ] **Cron:** `CRON_SECRET` required; reject weak or default values in prod build checks.
- [ ] Rotate and store **service role** only in server env; never `NEXT_PUBLIC_*`.

### 5. Multi-tenant

- [ ] Enforce **`company_id`** on invoice/client/document writes from UI (not only `user_id`).
- [ ] Add integration tests: user A cannot `select`/`update` user B rows (RLS regression).

---

## P1 — First months post-launch

- CSP headers, HSTS, referrer policy (hosting layer + `next.config`).
- CAPTCHA or proof-of-work on signup/login if abuse appears.
- Admin **immutable audit log** append-only policy (DB constraint).
- Secrets scanning in CI (GitHub push protection).

---

## P2 — Maturity

- WAF / bot management at edge.
- Quarterly penetration test scope including Supabase RLS review.

---

## References

- `MULTI_TENANT_SECURITY_REPORT.md`  
- `API_VALIDATION_MATRIX.md`  
- `middleware.ts`, `app/lib/admin/atlas-admin-access.ts`
