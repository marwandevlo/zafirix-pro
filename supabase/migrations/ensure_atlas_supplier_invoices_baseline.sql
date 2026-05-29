-- Baseline: public.atlas_supplier_invoices + RLS (idempotent).
-- Sprint E — OCR → supplier invoices REAL.
--
-- Prerequisite: public.atlas_companies, public.atlas_documents (Sprint A / D-alt).
-- Prerequisite: auth.users (Supabase Auth).
--
-- Run in SQL Editor BEFORE:
--   supabase/migrations/20260528160000_atlas_supplier_invoices_sprint_e.sql

create extension if not exists "pgcrypto";

create table if not exists public.atlas_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid,
  document_id uuid,

  supplier_name text not null default '',
  invoice_number text,
  invoice_date date,

  amount_ht numeric,
  vat_amount numeric,
  amount_ttc numeric,
  vat_rate numeric,

  status text not null default 'unpaid',

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
      and table_name = 'atlas_supplier_invoices'
      and constraint_name = 'atlas_supplier_invoices_company_id_fkey'
  ) then
    alter table public.atlas_supplier_invoices
      add constraint atlas_supplier_invoices_company_id_fkey
      foreign key (company_id) references public.atlas_companies (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'atlas_documents'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'atlas_supplier_invoices'
      and constraint_name = 'atlas_supplier_invoices_document_id_fkey'
  ) then
    alter table public.atlas_supplier_invoices
      add constraint atlas_supplier_invoices_document_id_fkey
      foreign key (document_id) references public.atlas_documents (id) on delete set null;
  end if;
end $$;

alter table public.atlas_supplier_invoices add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.atlas_supplier_invoices add column if not exists company_id uuid;
alter table public.atlas_supplier_invoices add column if not exists document_id uuid;
alter table public.atlas_supplier_invoices add column if not exists supplier_name text not null default '';
alter table public.atlas_supplier_invoices add column if not exists invoice_number text;
alter table public.atlas_supplier_invoices add column if not exists invoice_date date;
alter table public.atlas_supplier_invoices add column if not exists amount_ht numeric;
alter table public.atlas_supplier_invoices add column if not exists vat_amount numeric;
alter table public.atlas_supplier_invoices add column if not exists amount_ttc numeric;
alter table public.atlas_supplier_invoices add column if not exists vat_rate numeric;
alter table public.atlas_supplier_invoices add column if not exists status text not null default 'unpaid';
alter table public.atlas_supplier_invoices add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.atlas_supplier_invoices add column if not exists created_at timestamptz not null default now();
alter table public.atlas_supplier_invoices add column if not exists updated_at timestamptz not null default now();

create index if not exists atlas_supplier_invoices_user_idx on public.atlas_supplier_invoices (user_id);
create index if not exists atlas_supplier_invoices_company_idx on public.atlas_supplier_invoices (company_id);
create index if not exists atlas_supplier_invoices_document_idx on public.atlas_supplier_invoices (document_id);

-- Idempotent OCR → supplier invoice: one invoice per document per user.
create unique index if not exists atlas_supplier_invoices_user_document_unique
  on public.atlas_supplier_invoices (user_id, document_id)
  where document_id is not null;

alter table public.atlas_supplier_invoices enable row level security;

drop policy if exists "atlas_supplier_invoices_select_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_select_own"
  on public.atlas_supplier_invoices for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_supplier_invoices_insert_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_insert_own"
  on public.atlas_supplier_invoices for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_supplier_invoices_update_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_update_own"
  on public.atlas_supplier_invoices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_supplier_invoices_delete_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_delete_own"
  on public.atlas_supplier_invoices for delete
  using (auth.uid() = user_id);
