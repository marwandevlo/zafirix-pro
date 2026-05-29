-- Baseline: public.atlas_payments + RLS (idempotent).
-- Use when live Supabase never applied 20260430030000_atlas_saas_entities_links.sql
-- (or only partial migrations were run).
--
-- Prerequisite: auth.users (Supabase Auth).
-- Prerequisite: public.atlas_companies (optional FK).
-- Prerequisite: public.atlas_invoices (optional FK on invoice_id).

create extension if not exists "pgcrypto";

create table if not exists public.atlas_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid,
  invoice_id uuid,

  amount numeric not null default 0,
  currency text not null default 'MAD',
  status text not null default 'pending',
  method text,
  paid_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'atlas_companies'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'atlas_payments'
      and constraint_name = 'atlas_payments_company_id_fkey'
  ) then
    alter table public.atlas_payments
      add constraint atlas_payments_company_id_fkey
      foreign key (company_id) references public.atlas_companies (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'atlas_invoices'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'atlas_payments'
      and constraint_name = 'atlas_payments_invoice_id_fkey'
  ) then
    alter table public.atlas_payments
      add constraint atlas_payments_invoice_id_fkey
      foreign key (invoice_id) references public.atlas_invoices (id) on delete set null;
  end if;
end $$;

-- Backfill columns if an older partial table existed without them.
alter table public.atlas_payments add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.atlas_payments add column if not exists company_id uuid;
alter table public.atlas_payments add column if not exists invoice_id uuid;
alter table public.atlas_payments add column if not exists amount numeric not null default 0;
alter table public.atlas_payments add column if not exists currency text not null default 'MAD';
alter table public.atlas_payments add column if not exists status text not null default 'pending';
alter table public.atlas_payments add column if not exists method text;
alter table public.atlas_payments add column if not exists paid_at timestamptz;
alter table public.atlas_payments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.atlas_payments add column if not exists created_at timestamptz not null default now();
alter table public.atlas_payments add column if not exists updated_at timestamptz not null default now();

-- Legacy columns used by atlas-payments-repository (keep in sync with amount).
alter table public.atlas_payments add column if not exists paid_amount numeric not null default 0;
alter table public.atlas_payments add column if not exists note text;

update public.atlas_payments
set amount = paid_amount
where amount = 0 and paid_amount <> 0;

update public.atlas_payments
set paid_amount = amount
where paid_amount = 0 and amount <> 0;

create index if not exists atlas_payments_user_idx on public.atlas_payments (user_id);
create index if not exists atlas_payments_company_idx on public.atlas_payments (company_id);
create index if not exists atlas_payments_invoice_idx on public.atlas_payments (invoice_id);
create index if not exists atlas_payments_status_idx on public.atlas_payments (status);
create index if not exists atlas_payments_paid_at_idx on public.atlas_payments (paid_at);

create or replace function public.atlas_payments_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_payments_updated_at on public.atlas_payments;
create trigger atlas_payments_updated_at
  before update on public.atlas_payments
  for each row
  execute function public.atlas_payments_set_updated_at();

alter table public.atlas_payments enable row level security;

drop policy if exists "atlas_payments_select_own" on public.atlas_payments;
create policy "atlas_payments_select_own"
  on public.atlas_payments for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_payments_insert_own" on public.atlas_payments;
create policy "atlas_payments_insert_own"
  on public.atlas_payments for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_payments_update_own" on public.atlas_payments;
create policy "atlas_payments_update_own"
  on public.atlas_payments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_payments_delete_own" on public.atlas_payments;
create policy "atlas_payments_delete_own"
  on public.atlas_payments for delete
  using (auth.uid() = user_id);
