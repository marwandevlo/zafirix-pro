# Sprint 1 — Core persistence + real business data

**Goal:** Companies, clients, and invoices are authoritative in Supabase when `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase` (or production), scoped by `user_id` and linked via `company_id` / `client_id`.

## In scope

- Repository ownership filters (update/delete `.eq('user_id')`)
- Active company helper (`atlas-active-company.ts`)
- Pages: companies, clients, factures, settings, signup (first company), juridique, rh, consultant context
- PDF company context from Supabase active company
- Docs: `CORE_PERSISTENCE_MATRIX.md`

## Out of scope (Sprint 2+)

- Subscription unification
- Payment provider changes
- AI/OCR
- Full removal of all localStorage (admin demo, usage, referral buffers)
- New REST APIs for CRUD (RLS + client repos remain)

## Exit criteria

- [x] CRUD paths for companies/clients/invoices use Supabase repos when backend is supabase
- [x] Writes include `user_id`; updates/deletes filter `user_id`
- [x] Clients/invoices receive `company_id` (and invoices `client_id` when name matches)
- [x] Settings + signup persist company to `atlas_companies`
- [x] `npm run build` passes

## SQL

No new migration required — tables and RLS exist in `20260428120000_atlas_companies_accounting.sql` and `20260430030000_atlas_saas_entities_links.sql`.
