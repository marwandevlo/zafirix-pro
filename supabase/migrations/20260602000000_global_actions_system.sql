-- Global Actions System — entity events (audit log) + soft-delete columns.
-- Idempotent: safe to run multiple times.

create extension if not exists "pgcrypto";

-- ── atlas_entity_events — generic audit log ───────────────────────────────────

create table if not exists public.atlas_entity_events (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  company_id    uuid,
  entity_type   text        not null,
  entity_id     text        not null,
  event_type    text        not null,
  payload       jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists atlas_entity_events_entity_idx
  on public.atlas_entity_events (entity_type, entity_id, created_at desc);
create index if not exists atlas_entity_events_user_idx
  on public.atlas_entity_events (user_id, created_at desc);
create index if not exists atlas_entity_events_company_idx
  on public.atlas_entity_events (company_id, created_at desc)
  where company_id is not null;

alter table public.atlas_entity_events enable row level security;

drop policy if exists "atlas_entity_events_select_own" on public.atlas_entity_events;
create policy "atlas_entity_events_select_own"
  on public.atlas_entity_events for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_entity_events_insert_own" on public.atlas_entity_events;
create policy "atlas_entity_events_insert_own"
  on public.atlas_entity_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_entity_events_service_insert" on public.atlas_entity_events;
create policy "atlas_entity_events_service_insert"
  on public.atlas_entity_events for insert
  with check (true);

-- ── Soft-delete columns ───────────────────────────────────────────────────────

alter table public.atlas_invoices
  add column if not exists archived_at timestamptz;

alter table public.atlas_documents
  add column if not exists archived_at timestamptz;

alter table public.atlas_supplier_invoices
  add column if not exists archived_at timestamptz;

-- Partial indexes so active rows are fast to query
create index if not exists atlas_invoices_active_idx
  on public.atlas_invoices (company_id, issue_date desc)
  where archived_at is null;

create index if not exists atlas_documents_active_idx
  on public.atlas_documents (user_id, created_at desc)
  where archived_at is null;

create index if not exists atlas_supplier_invoices_active_idx
  on public.atlas_supplier_invoices (company_id, invoice_date desc)
  where archived_at is null;
