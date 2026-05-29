-- Baseline: public.atlas_clients + RLS (idempotent, no drops, no data deletion).
-- Use when live Supabase never applied 20260430030000_atlas_saas_entities_links.sql
-- (or only partial migrations were run).
--
-- Prerequisite: public.atlas_companies should exist (Sprint A / 20260428120000).
-- Prerequisite: auth.users (Supabase Auth).
--
-- Run in SQL Editor BEFORE:
--   supabase/migrations/20260528140000_atlas_clients_sprint_c.sql

create extension if not exists "pgcrypto";

create table if not exists public.atlas_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid,

  name text not null,
  email text,
  phone text,
  address text,
  city text,

  payment_terms_days integer not null default 30,
  balance_mad numeric not null default 0,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add company FK when atlas_companies exists (safe on fresh or partial DBs).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'atlas_companies'
  ) and not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'atlas_clients'
      and constraint_name = 'atlas_clients_company_id_fkey'
  ) then
    alter table public.atlas_clients
      add constraint atlas_clients_company_id_fkey
      foreign key (company_id) references public.atlas_companies (id) on delete set null;
  end if;
end $$;

-- Backfill columns if an older partial table existed without them.
alter table public.atlas_clients add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.atlas_clients add column if not exists company_id uuid;
alter table public.atlas_clients add column if not exists name text;
alter table public.atlas_clients add column if not exists email text;
alter table public.atlas_clients add column if not exists phone text;
alter table public.atlas_clients add column if not exists address text;
alter table public.atlas_clients add column if not exists city text;
alter table public.atlas_clients add column if not exists payment_terms_days integer not null default 30;
alter table public.atlas_clients add column if not exists balance_mad numeric not null default 0;
alter table public.atlas_clients add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.atlas_clients add column if not exists created_at timestamptz not null default now();
alter table public.atlas_clients add column if not exists updated_at timestamptz not null default now();

update public.atlas_clients set name = 'Sans nom' where name is null or trim(name) = '';
alter table public.atlas_clients alter column name set default '';
alter table public.atlas_clients alter column name set not null;

create index if not exists atlas_clients_user_idx on public.atlas_clients (user_id);
create index if not exists atlas_clients_company_idx on public.atlas_clients (company_id);

alter table public.atlas_clients enable row level security;

drop policy if exists "atlas_clients_select_own" on public.atlas_clients;
create policy "atlas_clients_select_own"
  on public.atlas_clients for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_clients_insert_own" on public.atlas_clients;
create policy "atlas_clients_insert_own"
  on public.atlas_clients for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_clients_update_own" on public.atlas_clients;
create policy "atlas_clients_update_own"
  on public.atlas_clients for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_clients_delete_own" on public.atlas_clients;
create policy "atlas_clients_delete_own"
  on public.atlas_clients for delete
  using (auth.uid() = user_id);
