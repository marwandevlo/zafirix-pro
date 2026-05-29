# Access Control Flow — ZAFIRIX PRO (Sprint 2)

## Middleware (`middleware.ts`)

**Order (Supabase backend):**

1. Public paths → allow without session (includes `/access-denied`, auth pages, marketing).
2. Production without Supabase backend → redirect to `/landing`.
3. `/admin` without Supabase (except local dev flag) → `/access-denied`.
4. Session: `supabase.auth.getUser()` — missing session → `/landing?next=…`
5. **Profile fetch** — `profiles.role`, `profiles.status`, `profiles.full_name` (single query).
6. **`profiles.status === 'suspended'`** → redirect **`/access-denied`** (all routes, including `/admin`).
7. **`/admin/*`** — allow if JWT admin metadata **or** owner email **or** privileged `profiles.role` (`owner` / `admin`); else `/access-denied`.

## Product entitlements (in-app)

**Not enforced in middleware** (by design in Sprint 2 — avoids per-request subscription DB joins):

- Premium vs free feature limits use **`atlas_subscriptions`** (and related client context), e.g. `ManualSubscriptionProvider` → `hasAtlasEntitlement`.

**Rationale:** Next.js middleware should stay fast; subscription resolution stays on write-time sync + client/server data fetches on feature surfaces.

## Role matrix

| Actor | Mechanism |
|-------|-----------|
| Logged-in user | Cookie session + RLS on Supabase reads |
| `suspended` | Middleware blocks app shell |
| Admin / owner | Middleware admin branch |
| Expired payer | No effective atlas row in date window → `profiles.plan` becomes `free` on next sync path; app treats as non-premium via atlas reads |
| Pending signup | Not distinguished in middleware; onboarding remains app-level |

## Admin API

- **`PATCH /api/admin/users`** with `plan` → `applyAdminProfilePlanToEntitlements` (atlas rewrite + profile sync). Prevents profile-only escalation vs atlas.
- Other profile fields (`role`, `status`, names) → direct `profiles` update after plan handling.

## Security notes

- **Escalation:** Arbitrary users cannot PATCH profiles; admin bearer + `isAtlasAdminUser`.
- **Suspended bypass:** Suspended users cannot reach private routes (public list still allows `/access-denied` without session — acceptable).
