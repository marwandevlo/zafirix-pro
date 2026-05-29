-- Baseline: atlas_payment_requests + atlas_subscriptions + RLS (idempotent, no drops, no data deletion).
-- Use when live Supabase never applied 20260430193000_atlas_saas_subscriptions_payments.sql.
-- Run in SQL Editor BEFORE supabase/migrations/20260516120000_sprint2_billing_subscription_integrity.sql
-- if public.atlas_subscriptions does not exist.

create extension if not exists "pgcrypto";

do $$ begin
  if not exists (select 1 from pg_type where typname = 'atlas_payment_request_status') then
    create type public.atlas_payment_request_status as enum ('pending', 'paid', 'rejected');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'atlas_subscription_status') then
    create type public.atlas_subscription_status as enum ('trial', 'active', 'cancelled');
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

create table if not exists public.atlas_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  plan_id text not null,
  status public.atlas_subscription_status not null default 'active',

  start_date date not null,
  end_date date not null,

  payment_request_id uuid references public.atlas_payment_requests (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_subscriptions_user_idx on public.atlas_subscriptions (user_id);
create index if not exists atlas_subscriptions_status_idx on public.atlas_subscriptions (status);
create index if not exists atlas_subscriptions_user_status_end_idx
  on public.atlas_subscriptions (user_id, status, end_date desc);

alter table public.atlas_payment_requests enable row level security;
alter table public.atlas_subscriptions enable row level security;

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

drop policy if exists "atlas_subscriptions_select_own" on public.atlas_subscriptions;
create policy "atlas_subscriptions_select_own"
  on public.atlas_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_subscriptions_admin_select" on public.atlas_subscriptions;
create policy "atlas_subscriptions_admin_select"
  on public.atlas_subscriptions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "atlas_subscriptions_admin_insert" on public.atlas_subscriptions;
create policy "atlas_subscriptions_admin_insert"
  on public.atlas_subscriptions for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "atlas_subscriptions_admin_update" on public.atlas_subscriptions;
create policy "atlas_subscriptions_admin_update"
  on public.atlas_subscriptions for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
