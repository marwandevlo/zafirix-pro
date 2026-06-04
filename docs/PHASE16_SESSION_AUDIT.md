# Phase 16 — Session Security Audit

## Mechanism

- **Provider:** Supabase Auth (JWT access + refresh in HTTP-only cookies via `@supabase/ssr`).
- **Middleware:** `middleware.ts` refreshes session on each request.
- **API fallback:** Bearer token for document/OCR automation scripts.

## Expiration

- Access token TTL configured in Supabase project (default 1h).
- Refresh token rotation handled by Supabase client libraries.

## Invalidation

- Logout clears Supabase session cookies via client `signOut`.
- Password reset invalidates sessions per Supabase policy.
- Pending approval users blocked at middleware (`profiles.status = pending`).

## Logout behavior

- Client: `supabase.auth.signOut()` on settings/logout flows.
- Server: No server-side session store — stateless JWT.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bearer token leakage | Medium | Short-lived tokens; HTTPS only |
| Local admin bypass | High (dev) | Env-gated; disabled in prod |
| Session fixation | Low | Supabase defaults |

## Recommendations

1. Enable Supabase MFA for admin accounts.
2. Set shorter JWT expiry for high-risk tenants (Enterprise).
3. Audit `profiles.status` on signup webhook.
