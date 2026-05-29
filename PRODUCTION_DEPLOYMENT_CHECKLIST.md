# ZAFIRIX PRO — Production deployment checklist

Use this before promoting a build to **staging** or **production**.

---

## 1. Environment & secrets

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set and valid.  
- [ ] `SUPABASE_SERVICE_ROLE_KEY` present **only** on server environments that run admin APIs / webhooks.  
- [ ] `NODE_ENV=production` build run (`npm run build`) passes in CI.  
- [ ] `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase` in staging/prod (prod already forced in code — still set for clarity).  
- [ ] **Never** set `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` in staging/prod.  
- [ ] `PADDLE_WEBHOOK_SECRET` set in prod (webhook verification).  
- [ ] `PADDLE_API_KEY`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, price IDs for paid checkout.  
- [ ] `CRON_SECRET` for `/api/cron/email-lifecycle`.  
- [ ] `ANTHROPIC_API_KEY` if AI routes enabled; otherwise disable UI entry points.  
- [ ] Sentry DSN / sampling configured for production.

---

## 2. Database

- [ ] All migrations applied in order on target project (`supabase db push` or CI pipeline).  
- [ ] RLS enabled on all user tables (verify with Supabase dashboard).  
- [ ] Backup schedule configured (PITR).  
- [ ] No `service_role` key in client bundles (scan build output).

---

## 3. Application security

- [ ] Smoke test: unauthenticated user → redirected from `/` to landing/login.  
- [ ] Non-admin user → `/admin` → `/access-denied`.  
- [ ] Admin user → `/admin` loads.  
- [ ] `/api/search` without bearer → 401.  
- [ ] Paddle webhook with bad signature → 400.

---

## 4. Business continuity

- [ ] Manual payment “mark paid” flow works end-to-end on staging.  
- [ ] Subscription activation reflects in UI after refresh.  
- [ ] Email lifecycle cron invoked with correct secret (dry run).

---

## 5. Legal / product safety

- [ ] AI surfaces show **Bêta** + non-binding advice copy.  
- [ ] `/client` demo portal **disabled** or behind feature flag until real auth — see `REAL_VS_FAKE_MATRIX.md`.

---

## 6. Observability

- [ ] Logs sink available (hosting provider + Sentry).  
- [ ] Alerts on 5xx spike for `/api/webhooks/paddle` and `/api/admin/*`.

---

## 7. Post-deploy

- [ ] Run smoke E2E script (login, create company, client, invoice).  
- [ ] Monitor first 24h for RLS violations in logs (`permission denied` patterns).

---

## References

- `PRODUCTION_AUDIT_MASTER.md`  
- `SECURITY_HARDENING_PLAN.md`  
- `MULTI_TENANT_SECURITY_REPORT.md`
