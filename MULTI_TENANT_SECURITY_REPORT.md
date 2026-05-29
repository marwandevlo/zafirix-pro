# ZAFIRIX PRO — Multi-tenant security report

**Model:** Per-user tenancy at the database row level (`user_id uuid not null` on `atlas_*` tables) with optional **`company_id`** for multi-company users. **RLS** policies in migrations enforce `auth.uid() = user_id` for standard users.

---

## What is working (REAL)

1. **Postgres RLS** on core atlas tables (`atlas_clients`, `atlas_invoices`, `atlas_documents`, `atlas_employees`, `atlas_projects`, `atlas_links`, `atlas_payments`, etc.) — see `supabase/migrations/20260430030000_atlas_saas_entities_links.sql`.
2. **Middleware** blocks unauthenticated access to private routes when Supabase backend is active; **admin** routes additionally require privileged profile / JWT / owner email path.
3. **Admin APIs** predominantly use **Bearer token** + `isAtlasAdminUser` before returning or mutating cross-tenant data.
4. **`/api/search`** uses user-scoped Supabase client; invoice/document/employee queries rely on RLS.

---

## Gaps and risks (PARTIAL / RISK)

### 1. Company-level isolation is application-defined

- Rows allow **`company_id` null** in several tables. UI must not leak “other company” data when `company_id` is null or mismatched.
- **Recommendation:** For production, add CHECK or NOT NULL where business rules require a company; add explicit `WHERE company_id = $active` in repositories when in multi-company mode.

### 2. Service role bypass

- Routes using **`SUPABASE_SERVICE_ROLE_KEY`** bypass RLS. Any bug becomes **horizontal privilege escalation**.
- **Recommendation:** After every service-role read/update, assert `row.user_id === targetUserId` (or admin-only cross-tenant operations documented).

### 3. Search — companies query

- Fetches `atlas_companies` with `limit(50)` then filters JSON in application code. RLS still restricts to the caller’s rows, but **cost** scales poorly for power users.
- **Recommendation:** Move to `company_json->>field` ILIKE with proper index strategy (generated columns or `tsvector` later).

### 4. Client singleton `supabase` (`app/lib/supabase.ts`)

- Browser session depends on Supabase JS default storage behavior. Server-side calls to repositories using this singleton **may not** see the user unless running in the browser.
- **Risk:** Future refactor that calls repos from Server Components without passing SSR client could return **empty lists** or fail writes silently (empty auth).
- **Recommendation:** Split **`createBrowserClient`** vs **`createServerClient`** modules; ban importing browser client in server routes.

### 5. Hardcoded break-glass owner email

- `ATLAS_OWNER_EMAIL_LOWER` in `atlas-admin-access.ts` is a **single point of policy** outside the database.
- **Recommendation:** Migrate to `profiles.role = 'owner'` for founders; keep env-based break-glass for support accounts only.

### 6. Development admin localStorage

- Documented in `middleware.ts`: when local admin flag is on, **admin UI is not server-protected** the same way — relies on client localStorage role.
- **Production:** Must be impossible via env + build pipeline checks.

---

## Testing checklist (tenant isolation)

- [ ] User A creates company C1; user B never sees C1 in search, invoices, clients, documents.  
- [ ] User A switches active company; lists filter to new `company_id`.  
- [ ] Attempt to PATCH another user’s `profiles` row via crafted admin API → **403**.  
- [ ] Paddle webhook with mismatched `user_id` in `custom_data` does not attach subscription to wrong user (validate in webhook handler).

---

## References

- `SECURITY_HARDENING_PLAN.md`  
- `PRODUCTION_AUDIT_MASTER.md`  
- `supabase/migrations/*.sql`
