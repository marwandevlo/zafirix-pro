# Phase 16 — Secret Management Audit

## Variables reviewed

| Secret | Location | In code? | Status |
|--------|----------|----------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server env only | No hardcode | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (RLS-bound) | Expected | ✅ |
| `ANTHROPIC_API_KEY` | Server env | No hardcode | ✅ |
| `OPENAI_API_KEY` | Server env | No hardcode | ✅ |
| `SENTRY_DSN` | Server env | No hardcode | ✅ |
| `PADDLE_WEBHOOK_SECRET` | Server env | No hardcode | ✅ |
| `CRON_SECRET` | Server env | No hardcode | ✅ |
| `GOOGLE_CLIENT_SECRET` | Server env | No hardcode | ✅ |

## Client bundle scan

- No `sk-`, `service_role`, or API keys in `app/` client components.
- `NEXT_PUBLIC_*` limited to Supabase URL/anon key and feature flags.

## Production guards

- `validateProductionConfiguration()` in `instrumentation.ts` warns on missing critical env.
- `ATLAS_AI_ALLOW_ANON` must be unset/false in production.
- `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` dev-only.

## Rotation procedures

1. **Supabase service role:** Dashboard → Settings → API → rotate; update Vercel env; redeploy.
2. **Anthropic/OpenAI:** Provider console → revoke old key after deploy.
3. **Sentry DSN:** Project settings → regenerate if leaked.
4. **CRON_SECRET / Paddle:** Update env + Vercel cron config.

## Findings

| Severity | Finding | Action |
|----------|---------|--------|
| Low | `.env.example` documents keys without values | ✅ Correct |
| Medium | Service role used broadly | Accept — required for audit/billing; never client-side |
