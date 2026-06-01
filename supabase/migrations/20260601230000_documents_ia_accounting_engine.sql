-- Documents IA → Accounting + TVA engine (idempotent).
-- Adds traceability to atlas_accounting_entries and creates
-- zafirix_tva_suggestions for per-invoice TVA draft tracking.

create extension if not exists "pgcrypto";

-- ── atlas_accounting_entries — traceability columns ───────────────────────────

alter table public.atlas_accounting_entries
  add column if not exists source_document_id uuid,
  add column if not exists source_invoice_id   uuid,
  add column if not exists generated_by        text not null default 'manual',
  add column if not exists validation_status   text not null default 'draft',
  add column if not exists company_id_col      uuid;

-- Backfill company_id_col from company_id (may already be company_id)
-- Note: atlas_accounting_entries already has company_id; we skip renaming.

alter table public.atlas_accounting_entries
  drop constraint if exists atlas_accounting_entries_validation_status_check;
alter table public.atlas_accounting_entries
  add constraint atlas_accounting_entries_validation_status_check
  check (validation_status in ('draft','validated','posted','cancelled'));

create index if not exists atlas_accounting_entries_source_doc_idx
  on public.atlas_accounting_entries (source_document_id)
  where source_document_id is not null;

create index if not exists atlas_accounting_entries_company_date_idx
  on public.atlas_accounting_entries (company_id, entry_date desc)
  where company_id is not null;

-- ── zafirix_tva_suggestions ───────────────────────────────────────────────────
-- Per-invoice TVA draft entries for transparent tracking.
-- TVA dashboard still computed live from supplier invoices;
-- this table provides per-document audit + status management.

create table if not exists public.zafirix_tva_suggestions (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  company_id          uuid        not null references public.atlas_companies (id) on delete cascade,
  source_document_id  uuid        not null,
  source_invoice_id   uuid,
  tva_type            text        not null,
  amount              numeric(14,2) not null,
  rate                numeric(5,2),
  base_ht             numeric(14,2),
  period_key          text        not null,
  invoice_date        date,
  invoice_number      text,
  supplier_name       text,
  validation_status   text        not null default 'pending',
  validated_at        timestamptz,
  validated_by        uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint zafirix_tva_suggestions_tva_type_check
    check (tva_type in ('deductible','collectee')),
  constraint zafirix_tva_suggestions_validation_status_check
    check (validation_status in ('pending','validated','rejected','included_in_declaration'))
);

create index if not exists zafirix_tva_suggestions_company_period_idx
  on public.zafirix_tva_suggestions (company_id, period_key, tva_type);
create index if not exists zafirix_tva_suggestions_source_doc_idx
  on public.zafirix_tva_suggestions (source_document_id);

alter table public.zafirix_tva_suggestions enable row level security;

drop policy if exists "zafirix_tva_suggestions_select_own" on public.zafirix_tva_suggestions;
create policy "zafirix_tva_suggestions_select_own"
  on public.zafirix_tva_suggestions for select
  using (auth.uid() = user_id);

drop policy if exists "zafirix_tva_suggestions_insert_own" on public.zafirix_tva_suggestions;
create policy "zafirix_tva_suggestions_insert_own"
  on public.zafirix_tva_suggestions for insert
  with check (auth.uid() = user_id);

drop policy if exists "zafirix_tva_suggestions_update_own" on public.zafirix_tva_suggestions;
create policy "zafirix_tva_suggestions_update_own"
  on public.zafirix_tva_suggestions for update
  using (auth.uid() = user_id);

-- ── Service-role insert policies (for server-side writes) ─────────────────────

drop policy if exists "zafirix_tva_suggestions_service_insert" on public.zafirix_tva_suggestions;
create policy "zafirix_tva_suggestions_service_insert"
  on public.zafirix_tva_suggestions for insert
  with check (true);

drop policy if exists "zafirix_accounting_entries_service_insert" on public.atlas_accounting_entries;
create policy "zafirix_accounting_entries_service_insert"
  on public.atlas_accounting_entries for insert
  with check (true);
