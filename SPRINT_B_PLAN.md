# Sprint B — Profiles & Settings Stabilization

**Project:** ZAFIRIX PRO  
**Scope:** Identity + access-control layer only (no billing rewrite, no Companies sprint changes)  
**Date:** 2026-05-28

---

## Audit summary (before Sprint B)

| Area | Finding |
|------|---------|
| **`profiles` table** | Used in code/middleware/admin but **no migration in repo** until Sprint B |
| **Middleware** | Read `role`, `status`, `full_name`; suspended → `/access-denied`; admin via JWT + owner email + role |
| **Missing profile row** | Could cause false admin denial or stale reads after cold signup |
| **Onboarding** | Completion stored in **localStorage only** (`atlas_onboarding_prefs`); no DB flag → re-entry loops possible |
| **Settings** | Company fields → `atlas_companies` (Sprint A); **no user profile editor** |
| **Billing sync** | `syncProfileEntitlementFromAtlas()` updates `profiles.plan` / `status` from `atlas_subscriptions` |
| **Signup** | Creates company in Supabase; profile row relied on external DB trigger (now in repo) |

---

## Sprint B deliverables

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Idempotent `profiles` migration + signup trigger | `20260528130000_profiles_baseline_sprint_b.sql` |
| 2 | Profile repository + guards | `atlas-profiles-repository.ts`, `atlas-profile-guards.ts` |
| 3 | Profile API (GET/PATCH) | `app/api/profile/route.ts` |
| 4 | Middleware profile recovery + normalized role/status | `middleware.ts` |
| 5 | Onboarding → `profiles.onboarding_completed` | `onboarding/page.tsx` |
| 6 | Settings → user profile + company persist | `settings/page.tsx` |
| 7 | Signup profile patch (integration) | `signup/page.tsx` |
| 8 | Admin role check normalization | `atlas-admin-access.ts` |
| 9 | Docs | This file + `PROFILE_STATE_FLOW.md` + `ACCESS_DECISION_MATRIX.md` |

---

## Normalized profile schema

| Column | Type | User writable | Notes |
|--------|------|---------------|-------|
| `id` | uuid PK | — | = `auth.users.id` |
| `email` | text | — | Synced from auth on signup |
| `role` | text | — | `user` \| `admin` \| `owner` — DB trigger blocks client mutation |
| `plan` | text | — | Cache from `atlas-subscription-sync` |
| `status` | text | — | `pending` \| `active` \| `suspended` \| `approved` |
| `full_name` | text | ✓ | Settings + PATCH |
| `company_name` | text | ✓ | Display label; company data stays in `atlas_companies` |
| `onboarding_completed` | boolean | ✓ | Set on onboarding finish |
| `created_at` | timestamptz | — | |
| `updated_at` | timestamptz | — | Auto trigger |

---

## Out of scope (Sprint B)

- Wiring `canCreateCompany()` to Supabase counts (Sprint E billing)
- Admin UI for `onboarding_completed`
- Automatic drift repair cron (detection helper only)
- Profile avatar / phone columns
- Forced middleware redirect to `/onboarding` (avoids loops)

---

## Exit criteria

- [ ] Migration applied on staging Supabase
- [ ] New signup creates `profiles` row via trigger
- [ ] Onboarding completion survives refresh (`onboarding_completed = true`)
- [ ] Settings `full_name` survives refresh
- [ ] Suspended users blocked; non-suspended pending users allowed
- [ ] Admin access works via owner email, JWT admin, or `profiles.role`
- [ ] `npm run build` green

---

## Sprint C recommendation

**Clients REAL** — see `MODULE_CONVERSION_ROADMAP.md` Sprint C. Companies + Profiles are now stable anchors for `company_id` on client writes.
