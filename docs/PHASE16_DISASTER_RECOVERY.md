# Phase 16 — Disaster Recovery Plan

## RTO / RPO targets

| Tier | RTO | RPO |
|------|-----|-----|
| Database | 4 hours | 1 hour (with PITR) |
| Application (Vercel) | 30 minutes | 0 (stateless) |
| AI provider outage | Degraded mode | N/A |

## Outage response

1. **Detect:** `/api/health/dependencies` alert + Sentry error spike + Supabase status page.
2. **Triage:** On-call checks dependency matrix (database, storage, AI, billing).
3. **Communicate:** Status update to customers if > 30 min impact.
4. **Mitigate:** Rollback Vercel deployment if release-related; else wait for provider.

## Database recovery

1. Stop write traffic (maintenance banner).
2. Restore Supabase to last known good timestamp.
3. Re-run pending migrations if needed (`supabase db push`).
4. Validate RLS and billing seeds.
5. Smoke test: login, document upload, AI chat.

## Credential rotation (incident)

1. Rotate leaked key in provider console.
2. Update Vercel environment variables.
3. Redeploy application.
4. Revoke active sessions if auth compromise suspected (`auth.admin.signOut` bulk).

## Rollback procedures

1. Vercel: promote previous deployment.
2. Migrations: forward-fix preferred; backward migration only if tested.
3. Feature flags: disable AI via removing `ANTHROPIC_API_KEY` (degraded, not down).

## Contacts

- Supabase support (project ref in dashboard)
- Vercel team dashboard
- Anthropic status: status.anthropic.com
