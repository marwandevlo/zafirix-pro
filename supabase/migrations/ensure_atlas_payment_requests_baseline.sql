-- Baseline: public.atlas_payment_requests + RLS (idempotent, no drops, no data deletion).
-- Use when live Supabase never applied 20260430193000_atlas_saas_subscriptions_payments.sql.
-- Safe to run even if ensure_atlas_subscriptions_baseline.sql was partially applied.
--
-- Prerequisite: auth.users (Supabase Auth).
-- Related: atlas_subscriptions.payment_request_id FK — run ensure_atlas_subscriptions_baseline.sql separately if needed.

create extension if not exists "pgcrypto";

do $$ begin
  if not exists (select 1 from pg_type where typname = 'atlas_payment_request_status') then
    create type public.atlas_payment_request_status as enum ('pending', 'paid', 'rejected');
  end if;
end $$;

create table if not exists public.atlas_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  plan_id text not null,
  amount_mad numeric not null default 0,
  currency text not null default 'MAD',
  billing_period text not null default 'year',

  payment_method text not null,
  manual_provider text,

  status public.atlas_payment_request_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_payment_requests_user_idx on public.atlas_payment_requests (user_id);
create index if not exists atlas_payment_requests_status_idx on public.atlas_payment_requests (status);
create index if not exists atlas_payment_requests_user_status_idx
  on public.atlas_payment_requests (user_id, status);

create or replace function public.atlas_payment_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_payment_requests_updated_at on public.atlas_payment_requests;
create trigger atlas_payment_requests_updated_at
  before update on public.atlas_payment_requests
  for each row
  execute function public.atlas_payment_requests_set_updated_at();

alter table public.atlas_payment_requests enable row level security;

drop policy if exists "atlas_payment_requests_select_own" on public.atlas_payment_requests;
create policy "atlas_payment_requests_select_own"
  on public.atlas_payment_requests for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_payment_requests_insert_own" on public.atlas_payment_requests;
create policy "atlas_payment_requests_insert_own"
  on public.atlas_payment_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_payment_requests_admin_update" on public.atlas_payment_requests;
create policy "atlas_payment_requests_admin_update"
  on public.atlas_payment_requests for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "atlas_payment_requests_admin_select" on public.atlas_payment_requests;
create policy "atlas_payment_requests_admin_select"
  on public.atlas_payment_requests for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
