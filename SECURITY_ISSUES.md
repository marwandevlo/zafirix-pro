# Security Issues — Atlas OS

Source-verified findings. Severity is **engineering judgment** (not a formal pentest).

---

## S1 — Hardcoded super-admin identifier (High)

**Location:** `app/lib/admin/atlas-admin-access.ts`  
**Issue:** `ATLAS_OWNER_EMAIL_LOWER` grants admin equivalent to profile/JWT checks.  
**Risk:** Repository leak, spear-phishing that account, or legal dispute over “back door.”  
**Mitigation:** Move to env (`ATLAS_OWNER_EMAILS` comma-separated), MFA on that account, break-glass procedure documented.

---

## S2 — Service role blast radius (High)

**Locations:** Multiple files under `app/api/admin/*`, `app/api/analytics/track/route.ts`, `app/api/cron/email-lifecycle/route.ts`, referral routes, etc.  
**Issue:** `createClient(url, SERVICE_ROLE_KEY)` bypasses RLS.  
**Risk:** Any SSRF, prototype pollution, or SQL-adjacent bug in hand-built queries could expose all tenants.  
**Mitigation:** Least-privilege DB roles where possible; strict input validation; admin audit on **every** mutation; IP allowlist for `/api/admin/*` in production.

---

## S3 — RLS policy vs application admin model (Medium–High)

**Evidence:** Migration `atlas_payment_requests_admin_update` uses `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` while `isAtlasAdminUser` also accepts **`profiles.role`** and owner email.  
**Risk:** Support user with `profiles.role = admin` might **fail** RLS-protected updates if JWT claim not synced — **BROKEN admin ops** or confused “works on my machine” with JWT-set admins only.  
**Mitigation:** Align RLS with one definition (e.g. `profiles.role` via security definer function or service role only for admin mutations).

---

## S4 — Public unauthenticated endpoints (Medium)

**Examples:**

- `POST /api/analytics/track` — rate-limited by IP (`checkPaymentRateLimit`); still accepts anonymous events (by design).  
- `POST /api/funnel/track` — forwards to analytics (deprecated path).  
- `POST /api/webhooks/paddle` — must stay public; protected by signature when secret set (**503** if service role missing).

**Risk:** Metadata injection, PII in event payloads, log poisoning.  
**Mitigation:** Strict schema allowlist (partially present — `ALLOWED` set in analytics route); size caps (present — `METADATA_MAX_BYTES`).

---

## S5 — AI and voice routes (Medium, improved)

**Current (verified):**

- `/api/ai` — requires Anthropic key; session via cookies or Bearer unless `ATLAS_AI_ALLOW_ANON=true` (`app/lib/ai-auth-server.ts`, `app/lib/atlas-api-session.ts`).  
- `/api/whisper`, `/api/tts` — require Supabase session + rate limit.

**Residual risks:**

- In-memory rate limits bypassable across instances.  
- No server-side prompt injection database isolation.  
- Large `max_tokens` still cost-bearing (capped in `/api/ai` but monitor).

---

## S6 — Cron endpoint (Medium)

**Location:** `app/api/cron/email-lifecycle/route.ts`  
**Issue:** Gated by `CRON_SECRET`; if unset or weak, lifecycle emails could be triggered by attackers.  
**Mitigation:** Require secret in production; reject if missing.

---

## S7 — Client-side trust (Medium)

**Examples:**

- Admin dashboard **local** mode uses `localStorage` role (`AdminDashboardClient.tsx`, `AdminShell.tsx`) when `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` — **dev only** by convention.  
- **Production** `/admin` is middleware-protected when Supabase backend (`middleware.ts`).

**Risk:** Future regression if someone enables local admin flags in prod build.  
**Mitigation:** CI assert `NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN` not set in production env.

---

## S8 — Secrets in client bundle (Low if discipline kept)

**Verified:** `NEXT_PUBLIC_*` only for Supabase URL/anon key and Paddle client token — **expected**.  
**Risk:** Anon key exposure is normal; security depends on **RLS**, not obscurity.

---

## S9 — Search API (Medium if RLS wrong)

**Location:** `app/api/search/route.ts`  
**Pattern:** Bearer token → Supabase client with user JWT.  
**Risk:** If a table lacks RLS or has overly permissive `SELECT`, search becomes a **data exfil channel**.  
**Mitigation:** Automated RLS tests per table included in search.

---

## S10 — PDF / document generation (Low security, High legal)

Client-side PDFs are not a direct **auth** bypass, but forged-looking documents increase **fraud** risk. Watermark “brouillon / non audité” on accounting outputs (partially done on compta page).

---

## Summary table

| ID | Severity | Topic |
|----|----------|--------|
| S1 | High | Hardcoded owner admin |
| S2 | High | Service role usage breadth |
| S3 | Med–High | RLS vs `isAtlasAdminUser` drift |
| S4 | Medium | Anonymous analytics/funnel |
| S5 | Medium | AI rate limits / cost |
| S6 | Medium | Cron secret |
| S7 | Medium | Client local admin dev paths |
| S8 | Low | Public env vars |
| S9 | Medium | Search + RLS |
| S10 | Legal | PDF trustworthiness |

---

## Recommended security roadmap (90 days)

1. External penetration test on `/api/admin/*`, `/api/ai`, webhooks, cron.  
2. RLS review with Supabase advisor; fix S3 drift.  
3. Remove hardcoded owner → env + MFA.  
4. Central admin audit + immutable log table (`atlas_admin_logs` — migration present).  
5. Redis rate limits for AI and anonymous endpoints.
