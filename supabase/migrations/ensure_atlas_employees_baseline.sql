-- Baseline: public.atlas_employees + RLS (idempotent, no drops, no data deletion).
-- Use when live Supabase never applied 20260430030000_atlas_saas_entities_links.sql
-- (or only partial migrations were run).
--
-- Prerequisite: public.atlas_companies should exist (Sprint A / 20260428120000).
-- Prerequisite: auth.users (Supabase Auth).
--
-- Run in SQL Editor BEFORE:
--   supabase/migrations/20260601160000_atlas_payroll_ir_is_real.sql

create extension if not exists "pgcrypto";

create table if not exists public.atlas_employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid,

  full_name text not null default '',
  email text,
  phone text,
  role text,
  department text,
  role_title text,
  cin text,
  cnss_matricule text,
  gross_salary_mad numeric not null default 0,
  hire_date date,
  status text not null default 'active',

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
      and table_name = 'atlas_employees'
      and constraint_name = 'atlas_employees_company_id_fkey'
  ) then
    alter table public.atlas_employees
      add constraint atlas_employees_company_id_fkey
      foreign key (company_id) references public.atlas_companies (id) on delete set null;
  end if;
end $$;

-- Backfill columns if an older partial table existed without them.
alter table public.atlas_employees add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.atlas_employees add column if not exists company_id uuid;
alter table public.atlas_employees add column if not exists full_name text;
alter table public.atlas_employees add column if not exists email text;
alter table public.atlas_employees add column if not exists phone text;
alter table public.atlas_employees add column if not exists role text;
alter table public.atlas_employees add column if not exists department text;
alter table public.atlas_employees add column if not exists role_title text;
alter table public.atlas_employees add column if not exists cin text;
alter table public.atlas_employees add column if not exists cnss_matricule text;
alter table public.atlas_employees add column if not exists gross_salary_mad numeric not null default 0;
alter table public.atlas_employees add column if not exists hire_date date;
alter table public.atlas_employees add column if not exists status text not null default 'active';
alter table public.atlas_employees add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.atlas_employees add column if not exists created_at timestamptz not null default now();
alter table public.atlas_employees add column if not exists updated_at timestamptz not null default now();

update public.atlas_employees set full_name = '' where full_name is null;
alter table public.atlas_employees alter column full_name set default '';
alter table public.atlas_employees alter column full_name set not null;

update public.atlas_employees set status = 'active' where status is null or trim(status) = '';
alter table public.atlas_employees alter column status set default 'active';
alter table public.atlas_employees alter column status set not null;

update public.atlas_employees set gross_salary_mad = 0 where gross_salary_mad is null;
alter table public.atlas_employees alter column gross_salary_mad set default 0;
alter table public.atlas_employees alter column gross_salary_mad set not null;

update public.atlas_employees set metadata = '{}'::jsonb where metadata is null;
alter table public.atlas_employees alter column metadata set default '{}'::jsonb;
alter table public.atlas_employees alter column metadata set not null;

create index if not exists atlas_employees_user_idx on public.atlas_employees (user_id);
create index if not exists atlas_employees_company_idx on public.atlas_employees (company_id);
create index if not exists atlas_employees_status_idx on public.atlas_employees (status);

alter table public.atlas_employees enable row level security;

drop policy if exists "atlas_employees_select_own" on public.atlas_employees;
create policy "atlas_employees_select_own"
  on public.atlas_employees for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_employees_insert_own" on public.atlas_employees;
create policy "atlas_employees_insert_own"
  on public.atlas_employees for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_employees_update_own" on public.atlas_employees;
create policy "atlas_employees_update_own"
  on public.atlas_employees for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_employees_delete_own" on public.atlas_employees;
create policy "atlas_employees_delete_own"
  on public.atlas_employees for delete
  using (auth.uid() = user_id);

create or replace function public.atlas_employees_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_employees_updated_at on public.atlas_employees;
create trigger atlas_employees_updated_at
  before update on public.atlas_employees
  for each row
  execute function public.atlas_employees_set_updated_at();
