# Core persistence matrix — Sprint 1

| Entity | Supabase table | Tenant key | Company link | Repo | Primary UI |
|--------|----------------|------------|--------------|------|------------|
| Company | `atlas_companies` | `user_id` | `is_active` flag | `atlas-companies-repository` | `/companies`, `/settings`, signup |
| Client | `atlas_clients` | `user_id` | `company_id` | `atlas-clients-repository` | `/clients` |
| Invoice | `atlas_invoices` | `user_id` | `company_id`, `client_id` | `atlas-invoices-repository` | `/factures` |

## Backend mode

| Mode | When | Source of truth |
|------|------|-----------------|
| `supabase` | `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase` or `NODE_ENV=production` | Postgres + RLS |
| `local` | Development only | `localStorage` via `ATLAS_STORAGE_KEYS` |

## Ownership (application + RLS)

| Operation | App-layer guard | RLS |
|-----------|-----------------|-----|
| List | `requireSupabaseUser()` | `auth.uid() = user_id` |
| Insert | `user_id` on row | `WITH CHECK` |
| Update | `.eq('user_id', auth.userId)` | `USING` + `WITH CHECK` |
| Delete | `.eq('user_id', auth.userId)` | `USING` |

## Active company

| Concern | Implementation |
|---------|----------------|
| Read | `getActiveAtlasCompany()` — `is_active` row or first company |
| Persist settings | `saveActiveCompanyFields()` → `upsertAtlasCompany` + `setActiveAtlasCompany` |
| Client/invoice linkage | `getActiveCompanyDbRowId()`, `resolveClientIdByName()` |

## Sprint 1 page status

| Page | Supabase persistence | Notes |
|------|---------------------|--------|
| `/companies` | Yes | Full CRUD + active selection |
| `/clients` | Yes | `company_id` on save |
| `/factures` | Yes | `company_id` + optional `client_id` |
| `/settings` | Yes | Active company JSON |
| `/signup` | Yes | First company on session signup |
| `/juridique`, `/rh` | Read list from Supabase | No longer localStorage-only load |
| `/consultant` | Context from active company | AI unchanged (Sprint 0 beta) |

## Remaining localStorage (acceptable for Sprint 1)

- Dev-only seeds on `/companies`, `/clients`, `/factures` when backend is `local`
- Admin demo subscriptions/payments arrays
- Usage limits, referral, funnel buffer, onboarding prefs
- `atlas_company` in local dev only (production blocked by Sprint 0 guards)
