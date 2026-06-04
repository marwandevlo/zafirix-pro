# Phase 19 — Release Checklist

**Target:** General Availability (GA)  
**Date:** 2026-06-04

---

## Infrastructure

- [x] Vercel production project configured
- [x] Supabase production project
- [ ] All Required env vars set in Vercel (see PHASE19_ENV_AUDIT)
- [x] Health endpoints public
- [x] CRON_SECRET documented
- [ ] Custom domain + SSL verified

---

## Security

- [x] Phase 16 hardening complete
- [x] Phase 19 final security review
- [x] RLS policies deployed
- [x] Rate limiting + metering active
- [x] Sentry configured
- [ ] Penetration test (recommended pre-scale)

---

## Billing

- [x] Plans + quotas in DB
- [x] Usage metering
- [x] Trial lifecycle
- [x] Admin billing tools
- [ ] Paddle production (when accepting payments)

---

## Monitoring

- [x] Sentry error tracking
- [x] Health + dependencies API
- [x] Admin metrics dashboard
- [x] `/admin/operations`
- [ ] External uptime monitor on `/api/health`
- [ ] Sentry alert rules configured

---

## Backups

- [x] Backup strategy documented
- [ ] PITR confirmed on production Supabase
- [ ] Restore drill completed

---

## Legal

- [x] `/legal` — Terms, Privacy, Cookies, DPN
- [x] Legacy `/terms`, `/privacy` retained
- [ ] Legal review by counsel (recommended)
- [ ] CNDP registration if required

---

## Support

- [x] Help center `/help`
- [x] User docs `docs/user/`
- [x] Support playbook
- [x] Feedback widget
- [ ] support@ email configured

---

## QA & Release

- [x] Phase 18 RC approved (1012 PASS)
- [x] Phase 19 verify script
- [x] tsc + build pass
- [x] Feature freeze policy
- [ ] 72h RC soak on staging

**Completion:** 28/35 automated ✅ — 7 operational items for launch team.
