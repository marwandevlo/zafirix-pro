-- Baseline: public.atlas_documents + RLS (idempotent, no drops, no data deletion).
-- Use when live Supabase never applied 20260430030000_atlas_saas_entities_links.sql
-- (or only partial migrations were run).
--
-- Prerequisite: auth.users (Supabase Auth).
-- Prerequisite: public.atlas_companies (optional — FK added only when table exists).
--
-- Run in SQL Editor BEFORE:
--   supabase/migrations/20260528150000_atlas_documents_real_foundation.sql

create extension if not exists "pgcrypto";

create table if not exists public.atlas_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid,

  title text not null,
  kind text not null default 'generic',
  source text not null default 'manual',
  status text not null default 'active',

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Legacy/partial installs: ensure all repository columns exist before indexes and FKs.
alter table public.atlas_documents add column if not exists company_id uuid;
alter table public.atlas_documents add column if not exists title text;
alter table public.atlas_documents add column if not exists kind text;
alter table public.atlas_documents add column if not exists source text;
alter table public.atlas_documents add column if not exists status text;
alter table public.atlas_documents add column if not exists type text;
alter table public.atlas_documents add column if not exists content jsonb;
alter table public.atlas_documents add column if not exists metadata jsonb;
alter table public.atlas_documents add column if not exists created_at timestamptz;
alter table public.atlas_documents add column if not exists updated_at timestamptz;

alter table public.atlas_documents alter column kind set default 'ocr';
alter table public.atlas_documents alter column source set default 'upload';
alter table public.atlas_documents alter column status set default 'active';
alter table public.atlas_documents alter column type set default 'generic';
alter table public.atlas_documents alter column metadata set default '{}'::jsonb;
alter table public.atlas_documents alter column created_at set default now();
alter table public.atlas_documents alter column updated_at set default now();

update public.atlas_documents set kind = 'ocr' where kind is null;
update public.atlas_documents set source = 'upload' where source is null;
update public.atlas_documents set status = 'active' where status is null;
update public.atlas_documents set type = 'generic' where type is null;
update public.atlas_documents set metadata = '{}'::jsonb where metadata is null;
update public.atlas_documents set created_at = now() where created_at is null;
update public.atlas_documents set updated_at = now() where updated_at is null;
update public.atlas_documents set title = coalesce(title, 'Document') where title is null;

-- Add company FK only when atlas_companies exists and company_id column is present.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'atlas_companies'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atlas_documents'
      and column_name = 'company_id'
  ) and not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'atlas_documents'
      and constraint_name = 'atlas_documents_company_id_fkey'
  ) then
    alter table public.atlas_documents
      add constraint atlas_documents_company_id_fkey
      foreign key (company_id) references public.atlas_companies (id) on delete set null;
  end if;
end $$;

create index if not exists atlas_documents_user_idx on public.atlas_documents (user_id);
create index if not exists atlas_documents_company_idx on public.atlas_documents (company_id);
create index if not exists atlas_documents_type_idx on public.atlas_documents (type);

alter table public.atlas_documents enable row level security;

drop policy if exists "atlas_documents_select_own" on public.atlas_documents;
create policy "atlas_documents_select_own"
  on public.atlas_documents for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_documents_insert_own" on public.atlas_documents;
create policy "atlas_documents_insert_own"
  on public.atlas_documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_documents_update_own" on public.atlas_documents;
create policy "atlas_documents_update_own"
  on public.atlas_documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_documents_delete_own" on public.atlas_documents;
create policy "atlas_documents_delete_own"
  on public.atlas_documents for delete
  using (auth.uid() = user_id);
