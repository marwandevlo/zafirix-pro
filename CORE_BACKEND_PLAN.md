# Core Backend Plan — Stabilization

**Objective:** One persistence path per core entity, tenant-safe writes, deterministic errors.

---

## 1. Canonical stores

| Entity | Table(s) | Client access |
|--------|-----------|----------------|
| User profile | `profiles` | Supabase Auth + RLS |
| Company | `atlas_companies` (`company_json`, `is_active`) | Repository only |
| Client | `atlas_clients` | Repository only |
| Invoice | `atlas_invoices` | Repository only |
| Payment | `atlas_payments` | Repository only |
| Subscription (target) | `atlas_subscriptions` (+ cache `profiles.plan`) | Server routes / future resolver |

---

## 2. Repository contract

Each repository **must**:

- When `isAtlasSupabaseDataEnabled()`:
  - Use `requireSupabaseUser()` (or cookie SSR equivalent on server routes).
  - Never read/write `localStorage` for that entity.
  - On list error: log + return `[]` (already for invoices/clients/documents/companies/payments).
  - On write error: return `{ ok: false, error }` — caller shows UI message.

When **local** backend (dev only):

- `localStorage` allowed for rapid UI iteration.

---

## 3. Identifier rules

- **UUID** string ids for new Supabase rows (invoices, clients, company rows).
- **Legacy** numeric ids may exist inside `company_json` as `legacy_local_id` on DB row.

---

## 4. Company row shape

- **DB:** `atlas_companies.id` (uuid), `user_id`, `company_json`, `is_active`, `legacy_local_id`.
- **UI:** `AtlasCompany` + optional `dbRowId` (same as row id) for mutations.

---

## 5. Admin / service role

- Admin routes: Bearer → `getUser` → `isAtlasAdminUser` → service role for cross-tenant reads/writes.
- **Never** expose service role to the browser.
- Prefer validating `user_id` / `company_id` in body against allowed scope (Sprint 1–3 incremental).

---

## 6. AI (non-core persistence)

- `/api/ai` remains **integration**, not source of truth for accounting.
- Mark UI modules as **Bêta**; responses include `safetyNotice` where implemented.

---

## 7. Verification

- Staging: create user A/B, confirm RLS isolation on invoices/clients/companies.  
- Load test not required for beta; optional connection pooler check.
