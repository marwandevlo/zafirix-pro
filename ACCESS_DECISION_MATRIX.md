# Access Decision Matrix — ZAFIRIX PRO

Sprint B — who can access what, and why.

---

## Route access (middleware)

| Route pattern | Auth required | Profile required | Block conditions | Allow conditions |
|---------------|---------------|------------------|------------------|------------------|
| `/landing`, `/login`, `/signup`, … | No | No | — | Public |
| `/api/analytics/track`, `/api/funnel/track` | No | No | — | Anonymous telemetry |
| `/api/cron/*`, `/api/webhooks/paddle` | Secret in handler | No | Invalid secret | Valid secret |
| `/admin/*` | Yes | Yes (auto-recover) | Not privileged | See admin matrix below |
| All other app routes | Yes | Yes (auto-recover) | `status=suspended` | Authenticated + not suspended |
| Production + non-Supabase backend | — | — | All private | Redirect `/landing` |

---

## Admin privilege matrix

User is **admin-privileged** if **any** of:

| Check | Source | Priority |
|-------|--------|----------|
| JWT `app_metadata.role === 'admin'` | Supabase Auth JWT | 1 |
| Email === owner email (`ATLAS_OWNER_EMAIL_LOWER`) | Hardcoded ops bootstrap | 2 |
| `normalizeProfileRole(profiles.role)` ∈ `{ owner, admin }` | `public.profiles` | 3 |

**Denied:** all checks false → `/access-denied`

**Note:** `status=pending` does **not** block admin if role/email/JWT qualifies.

---

## Profile status matrix

| `profiles.status` | App access | Admin access | Billing sync can set |
|-------------------|------------|--------------|----------------------|
| `pending` | ✓ Allow | If privileged | No auto-change |
| `active` | ✓ Allow | If privileged | Yes (from entitlement) |
| `approved` | ✓ Allow | If privileged | Manual/admin |
| `suspended` | ✗ `/access-denied` | ✗ | Never auto-cleared |

Invalid/unknown status → normalized to `pending` (allow app, block nothing except suspended).

---

## Profile role matrix

| `profiles.role` | Admin UI | Writable by user | Writable by service role |
|-----------------|----------|------------------|--------------------------|
| `user` | No | — (trigger blocks) | Yes |
| `admin` | Yes | — | Yes |
| `owner` | Yes | — | Yes |

Invalid role → normalized to `user`.

---

## Profile plan matrix (cache)

| `profiles.plan` | Meaning (cache) | Source of truth |
|-----------------|-----------------|-----------------|
| `free` | Trial or no paid entitlement | `atlas_subscriptions` |
| `pro` | Starter–Pro tier bucket | `atlas_subscriptions` |
| `vip` | Business/Advanced bucket | `atlas_subscriptions` |
| `enterprise` | Enterprise tier | `atlas_subscriptions` |

Invalid plan → normalized to `free`.  
User cannot PATCH `plan` (trigger + RLS protection).

---

## API `/api/profile`

| Method | Auth | Writable fields | Errors |
|--------|------|-----------------|--------|
| GET | Session cookie or Bearer | — | 401, 404, 503 |
| PATCH | Session cookie or Bearer | `full_name`, `company_name`, `onboarding_completed` | 400 validation, 401, 404 |

Service role used server-side for recovery insert only inside route handler.

---

## False access-denied prevention (Sprint B fixes)

| Scenario | Before | After |
|----------|--------|-------|
| Profile row missing after signup | Admin check fails on null role | Middleware recovers row |
| Invalid role string in DB | Unpredictable admin check | `normalizeProfileRole()` → `user` |
| `pending` status | Sometimes confused with blocked | Explicitly allowed for app routes |
| Onboarding re-entry | localStorage only | DB `onboarding_completed` redirect |

---

## localStorage authority (production)

| Key | Production authority |
|-----|---------------------|
| `profiles` data | **None** — Supabase only |
| `atlas_onboarding_prefs` | Non-authoritative (dev/telemetry cache) |
| `zafirix_show_onboarding` | UX session flag only |
| `atlas_company` / companies | Blocked in production (Sprint A) |
