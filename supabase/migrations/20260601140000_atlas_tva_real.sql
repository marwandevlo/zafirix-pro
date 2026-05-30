-- TVA module — period snapshots and declaration status (real persistence).

create extension if not exists "pgcrypto";

create table if not exists public.atlas_tva_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  period_type text not null,
  period_key text not null,
  period_start date not null,
  period_end date not null,
  tva_collectee numeric(14, 2) not null default 0,
  tva_deductible numeric(14, 2) not null default 0,
  tva_nette numeric(14, 2) not null default 0,
  ca_ht numeric(14, 2) not null default 0,
  achats_ht numeric(14, 2) not null default 0,
  sales_count integer not null default 0,
  purchases_count integer not null default 0,
  status text not null default 'pending',
  declaration_due_date date not null,
  declared_at timestamptz,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_tva_periods_type_check
    check (period_type in ('monthly', 'quarterly')),
  constraint atlas_tva_periods_status_check
    check (status in ('pending', 'declared')),
  constraint atlas_tva_periods_company_period_unique
    unique (company_id, period_type, period_key)
);

create index if not exists atlas_tva_periods_user_idx on public.atlas_tva_periods (user_id);
create index if not exists atlas_tva_periods_company_idx on public.atlas_tva_periods (company_id, period_end desc);

alter table public.atlas_tva_periods enable row level security;

drop policy if exists "atlas_tva_periods_select_own" on public.atlas_tva_periods;
create policy "atlas_tva_periods_select_own"
  on public.atlas_tva_periods for select using (auth.uid() = user_id);

drop policy if exists "atlas_tva_periods_insert_own" on public.atlas_tva_periods;
create policy "atlas_tva_periods_insert_own"
  on public.atlas_tva_periods for insert with check (auth.uid() = user_id);

drop policy if exists "atlas_tva_periods_update_own" on public.atlas_tva_periods;
create policy "atlas_tva_periods_update_own"
  on public.atlas_tva_periods for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "atlas_tva_periods_delete_own" on public.atlas_tva_periods;
create policy "atlas_tva_periods_delete_own"
  on public.atlas_tva_periods for delete using (auth.uid() = user_id);
