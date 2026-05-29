# ZAFIRIX PRO — Admin system stabilization

**Scope:** `/admin/*` pages, `/api/admin/*` routes, privilege model (`atlas-admin-access.ts`), service role usage, audit logging (`atlas_admin_logs` migration).

---

## Current classification: **PARTIAL**

**Strengths**

- Middleware denies `/admin` when backend is not Supabase (except explicit **dev** local admin flag).  
- Privileged access via **`isAtlasAdminUser`**: JWT `app_metadata.role`, hardcoded owner email, or `profiles.role` in (`owner`, `admin`).  
- Several admin routes use **Bearer** + user-scoped Supabase client for auth, then **service role** for `auth.admin` / `profiles` listing.

**Critical risks**

1. **localStorage admin role** in `AdminShell`, `AdminDashboardClient`, `admin/subscriptions/page` — must never affect production.  
2. **Hardcoded owner email** — operational fragility; document rotation procedure.  
3. **Service role absent:** `/api/admin/users` GET returns `warning` + empty list — OK for dev, but production **must** fail deploy check if key missing for environments that need admin.  
4. **Audit completeness:** not every mutation (reject payment, activate subscription) may write `admin_logs` — standardize.  
5. **Error leakage:** some routes return `error.message` from PostgREST — sanitize per `API_VALIDATION_MATRIX.md`.

---

## Stabilization checklist

- [ ] Single **`assertAdmin(request)`** helper wrapping bearer parse + `isAtlasAdminUser` + structured log of `admin_user_id`, `route`, `ip`.  
- [ ] **Zod** for all admin POST bodies (ids, enums, amounts).  
- [ ] **Mark paid / reject:** verify row exists; optional second check `user_id` of payment request matches expectation; write audit log with before/after snapshot JSON.  
- [ ] **Rate limits** on destructive admin actions (per admin user id).  
- [ ] **Remove** client-side admin gate code paths from production bundles or guard with `process.env.NODE_ENV`.  
- [ ] **Monitoring:** Sentry tags `area=admin` for all `/api/admin/*`.

---

## References

- `middleware.ts`  
- `app/lib/admin/atlas-admin-access.ts`  
- `app/api/admin/users/route.ts`  
- `supabase/migrations/20260511120000_atlas_admin_logs.sql`  
- `ADMIN_SYSTEM` cross-links in `SECURITY_HARDENING_PLAN.md`
