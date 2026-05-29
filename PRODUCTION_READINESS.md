# Production Readiness — Atlas OS

Verified from source: **Next.js 16.2**, **App Router**, **Supabase JS + SSR**, **30 API route files** under `app/api/`.

---

## Environment variables (incomplete list from codebase)

### Required for any production private app

| Variable | Used for |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server (RLS) |
| `NODE_ENV=production` | Forces `atlasDataBackend()` → `supabase` (`app/lib/atlas-data-source.ts`) |

### Server-only secrets (must never be `NEXT_PUBLIC_*`)

| Variable | Used for |
|----------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE` | Admin APIs, cron, webhooks, analytics insert, referrals |
| `ANTHROPIC_API_KEY` | `/api/ai` |
| `OPENAI_API_KEY` | `/api/whisper`, `/api/tts` |
| `PADDLE_WEBHOOK_SECRET` | Webhook signature (`app/lib/paddle-webhook`) |
| `PADDLE_API_KEY` | Checkout prep (`app/api/paddle/checkout/route.ts`) |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Client checkout |
| `PADDLE_PRICE_STARTER_ID`, `PADDLE_PRICE_PRO_ID`, `PADDLE_PRICE_BUSINESS_ID` | Price IDs |
| `CRON_SECRET` | `app/api/cron/email-lifecycle/route.ts` |
| `SENTRY_DSN` | `instrumentation.ts` + `captureAtlasServerException` |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional, default `0.05` |
| `WHATSAPP_*` | `app/lib/whatsapp-service.ts` (optional ops) |

### Feature flags / tuning

| Variable | Behavior |
|----------|----------|
| `NEXT_PUBLIC_ATLAS_DATA_BACKEND` | `local` vs `supabase` in **development only**; production ignores and uses Supabase |
| `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` | Dev-only admin UI branch with localStorage role (`middleware.ts`, admin clients) |
| `NEXT_PUBLIC_ATLAS_ENABLE_ASSISTANT_OVERLAY` | `app/layout.tsx` |
| `NEXT_PUBLIC_ATLAS_ENABLE_GLOBAL_SEARCH_OVERLAY` | `app/layout.tsx` |
| `ATLAS_AI_ALLOW_ANON` | If true — **anonymous `/api/ai`** (must be false in prod) |
| `ATLAS_AI_RATE_WINDOW_SEC`, `ATLAS_AI_RATE_MAX` | In-memory AI rate limits |

---

## Deployment readiness

### Build

- `npm run build` succeeds in this repo (CI should run on every PR).
- No Docker/Kubernetes manifests in repo — **bring your own** hosting (Vercel, Fly, etc.).

### Database

- **16 SQL migrations** under `supabase/migrations/` — must be applied in order on the target project.
- New table **`atlas_admin_logs`** (`20260511120000_atlas_admin_logs.sql`) — apply before relying on audit helper.

### Edge / middleware

- Next.js warns: **middleware convention deprecated** in favor of “proxy” (framework migration risk).

### Observability

- **Structured JSON logs:** `app/lib/atlas-server-log.ts` (`logAtlasServerEvent`, `captureAtlasServerException`).
- **Sentry:** optional via `SENTRY_DSN`; `@sentry/nextjs` may require `--legacy-peer-deps` vs Next 16 peer range — document for ops.

### Scalability (current posture)

| Concern | Status |
|---------|--------|
| Stateless API routes | **OK** for horizontal scale |
| In-memory rate limits | **Not** safe multi-instance — use Redis/Upstash |
| Serverless cold starts | Anthropic/OpenAI calls may timeout — add explicit timeouts and smaller `max_tokens` where needed |
| DB connection pooling | Supabase pooler — standard; verify plan limits |

---

## Error handling (patterns observed)

- Many routes return JSON `{ error: string }` with appropriate HTTP status — **good**.
- Some admin flows `console.error` / `console.warn` on DB errors — should converge on **`logAtlasServerEvent`**.
- Repository list failures return `[]` + log (invoices/clients/documents/companies/payments) — **explicit empty** vs silent wrong data (**good** for integrity).

---

## Caching

- **No HTTP CDN cache** headers audited globally.
- **No Next.js unstable_cache** / tag revalidation patterns found in quick scan — mostly client state + direct Supabase reads.
- **Risk:** Over-fetching lists on every navigation unless React cache or SWR added later.

---

## Performance (code-level risks)

- Large client pages (`juridique/page.tsx` ~1200+ lines) — bundle size and TTI.
- jsPDF dynamic imports on some pages — acceptable.
- Admin `listUsers` may walk **many pages** of auth users (`app/api/admin/users/route.ts`) — scalability concern at scale.

---

## Multi-tenant isolation

- **Intended model:** `user_id` on SaaS tables + **RLS** (see migrations).
- **Verification required:** Staging tests that user A cannot `select`/`update` user B’s rows for **every** table the app touches (including `events`, referrals, subscriptions variants).

---

## Billing readiness checklist

- [ ] `PADDLE_*` env complete or UI hides “Pay with Paddle”
- [ ] Webhook endpoint reachable from Paddle with secret set
- [ ] Reconciliation job: `subscriptions` + `atlas_subscriptions` + `profiles.plan`
- [ ] Refund/chargeback SOP documented

---

## What “production ready” means for this codebase

Minimum bar:

1. All migrations applied; RLS penetration-tested.  
2. Single subscription story + enforced entitlements server-side.  
3. No `ATLAS_AI_ALLOW_ANON` in prod; AI routes monitored.  
4. Ops runbook: secrets rotation, backup/restore drill, on-call.

Until then: **pilot-ready**, not **general-public SaaS-ready**.
