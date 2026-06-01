-- Documents IA Central Engine — idempotent migration.
-- Adds classification, validation, sha256 dedup, event log, corrections.

create extension if not exists "pgcrypto";

-- ── atlas_documents new columns ──────────────────────────────────────────────

alter table public.atlas_documents
  add column if not exists document_type    text,
  add column if not exists validation_status text not null default 'pending_review',
  add column if not exists sha256_hash       text,
  add column if not exists validated_at      timestamptz,
  add column if not exists validated_by      uuid;

alter table public.atlas_documents
  drop constraint if exists atlas_documents_validation_status_check;
alter table public.atlas_documents
  add constraint atlas_documents_validation_status_check
  check (validation_status in ('pending_review','validated','rejected','needs_correction'));

create index if not exists atlas_documents_sha256_idx
  on public.atlas_documents (company_id, sha256_hash)
  where sha256_hash is not null;

create index if not exists atlas_documents_type_validation_idx
  on public.atlas_documents (company_id, document_type, validation_status);

-- ── zafirix_document_events ───────────────────────────────────────────────────

create table if not exists public.zafirix_document_events (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references public.atlas_companies (id) on delete cascade,
  document_id  uuid        not null,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  event_type   text        not null,
  severity     text        not null default 'info',
  payload      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint zafirix_document_events_severity_check
    check (severity in ('info','warn','error'))
);

create index if not exists zafirix_document_events_doc_idx
  on public.zafirix_document_events (document_id, created_at desc);
create index if not exists zafirix_document_events_company_idx
  on public.zafirix_document_events (company_id, created_at desc);

alter table public.zafirix_document_events enable row level security;
drop policy if exists "zafirix_document_events_select_own" on public.zafirix_document_events;
create policy "zafirix_document_events_select_own"
  on public.zafirix_document_events for select
  using (auth.uid() = user_id);
drop policy if exists "zafirix_document_events_insert_own" on public.zafirix_document_events;
create policy "zafirix_document_events_insert_own"
  on public.zafirix_document_events for insert
  with check (auth.uid() = user_id);

-- ── zafirix_corrections ───────────────────────────────────────────────────────

create table if not exists public.zafirix_corrections (
  id                  uuid        primary key default gen_random_uuid(),
  company_id          uuid        not null references public.atlas_companies (id) on delete cascade,
  user_id             uuid        not null references auth.users (id) on delete cascade,
  module              text        not null default 'documents',
  entity_type         text        not null default 'document',
  entity_id           uuid        not null,
  field_name          text        not null,
  old_value           text,
  new_value           text,
  raw_value           text,
  normalized_value    text,
  confidence_before   numeric(4,3),
  correction_reason   text,
  source_document_id  uuid,
  source_page         integer,
  created_at          timestamptz not null default now()
);

create index if not exists zafirix_corrections_entity_idx
  on public.zafirix_corrections (entity_id, field_name, created_at desc);
create index if not exists zafirix_corrections_document_idx
  on public.zafirix_corrections (source_document_id);

alter table public.zafirix_corrections enable row level security;
drop policy if exists "zafirix_corrections_select_own" on public.zafirix_corrections;
create policy "zafirix_corrections_select_own"
  on public.zafirix_corrections for select
  using (auth.uid() = user_id);
drop policy if exists "zafirix_corrections_insert_own" on public.zafirix_corrections;
create policy "zafirix_corrections_insert_own"
  on public.zafirix_corrections for insert
  with check (auth.uid() = user_id);
drop policy if exists "zafirix_corrections_delete_own" on public.zafirix_corrections;
create policy "zafirix_corrections_delete_own"
  on public.zafirix_corrections for delete
  using (auth.uid() = user_id);

-- ── atlas_supplier_invoices — traceability columns ────────────────────────────

alter table public.atlas_supplier_invoices
  add column if not exists generated_by       text    default 'manual',
  add column if not exists confidence_score   numeric(4,3),
  add column if not exists user_verified      boolean not null default false,
  add column if not exists source_document_id uuid,
  add column if not exists validation_status  text    not null default 'draft',
  add column if not exists supplier_ice       text,
  add column if not exists supplier_if        text,
  add column if not exists supplier_rc        text,
  add column if not exists supplier_address   text,
  add column if not exists customer_name      text,
  add column if not exists due_date           date,
  add column if not exists payment_method     text,
  add column if not exists line_items         jsonb   default '[]'::jsonb,
  add column if not exists currency           text    default 'MAD',
  add column if not exists category           text,
  add column if not exists accounting_account text;

alter table public.atlas_supplier_invoices
  drop constraint if exists atlas_supplier_invoices_validation_status_check;
alter table public.atlas_supplier_invoices
  add constraint atlas_supplier_invoices_validation_status_check
  check (validation_status in ('draft','validated','rejected','posted'));
