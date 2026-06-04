# Phase 19 — Production Environment Audit

**Date:** 2026-06-04  
**Scope:** Vercel Production environment variables

---

## Classification legend

| Tag | Meaning |
|-----|---------|
| **Required** | App fails or is insecure without it in production |
| **Optional** | Feature degraded if missing |
| **Missing** | Not in `.env.example` but used in code — must set in Vercel |

---

## Supabase

| Variable | Classification | Notes |
|----------|----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | RLS-bound public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Server-only; admin, metering, webhooks |
| `NEXT_PUBLIC_ATLAS_DATA_BACKEND` | **Required** | Must be `supabase` in production |

---

## Vercel / Site

| Variable | Classification | Notes |
|----------|----------------|-------|
| `NEXT_PUBLIC_SITE_URL` | **Required** | Auth redirects, emails |
| `NODE_ENV` | Auto | Set by Vercel |

---

## AI providers

| Variable | Classification | Notes |
|----------|----------------|-------|
| `ANTHROPIC_API_KEY` | **Required** | Copilot, audit, insights (primary) |
| `OPENAI_API_KEY` | **Optional** | Whisper, fallback provider |
| `ATLAS_AI_ALLOW_ANON` | **Required absent** | Must NOT be `true` in production |

---

## Billing

| Variable | Classification | Notes |
|----------|----------------|-------|
| `PADDLE_API_KEY` | **Optional** | Online checkout when enabled |
| `PADDLE_WEBHOOK_SECRET` | **Optional** | Webhook verification |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | **Optional** | Client-side Paddle |
| `PADDLE_PRICE_STARTER_ID` | **Optional** | Plan mapping |
| `PADDLE_PRICE_PRO_ID` | **Optional** | Plan mapping |
| `PADDLE_PRICE_BUSINESS_ID` | **Optional** | Plan mapping |
| `PADDLE_ENVIRONMENT` | **Optional** | `production` or `sandbox` |

---

## Sentry

| Variable | Classification | Notes |
|----------|----------------|-------|
| `SENTRY_DSN` | **Required** | Error tracking |
| `SENTRY_ORG` | **Required** | Build upload |
| `SENTRY_PROJECT` | **Required** | Build upload |
| `NEXT_PUBLIC_SENTRY_DSN` | **Optional** | Client errors if configured |

---

## Email & Cron

| Variable | Classification | Notes |
|----------|----------------|-------|
| `RESEND_API_KEY` / `EMAIL_API_KEY` | **Optional** | Lifecycle emails |
| `RESEND_FROM_EMAIL` | **Optional** | Sender address |
| `CRON_SECRET` | **Required** | `/api/cron/*` protection |

---

## Integrations

| Variable | Classification | Notes |
|----------|----------------|-------|
| `GOOGLE_CLIENT_ID` | **Optional** | Drive backup |
| `GOOGLE_CLIENT_SECRET` | **Optional** | Drive OAuth |

---

## Remediation checklist

- [ ] Set all **Required** variables in Vercel Production
- [ ] Verify `SUPABASE_SERVICE_ROLE_KEY` is NOT prefixed with `NEXT_PUBLIC_`
- [ ] Confirm `NEXT_PUBLIC_SITE_URL` matches production domain
- [ ] Enable Sentry DSN and verify test error in staging
- [ ] Set `CRON_SECRET` and configure Vercel Cron
- [ ] Rotate service role key if ever exposed
- [ ] Document Paddle keys before enabling paid checkout
- [ ] Run `validateProductionConfiguration()` on deploy (instrumentation.ts)

---

## Audit result

**Status:** Ready pending Vercel env confirmation on staging. No hardcoded secrets in codebase (Phase 16 audit).
