-- Ensure public.atlas_payment_requests for /payment manual checkout.
-- Idempotent: safe when 20260430193000 / ensure_atlas_payment_requests_baseline were never applied.

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

alter table public.atlas_payment_requests add column if not exists plan_id text;
alter table public.atlas_payment_requests add column if not exists amount_mad numeric;
alter table public.atlas_payment_requests add column if not exists currency text;
alter table public.atlas_payment_requests add column if not exists billing_period text;
alter table public.atlas_payment_requests add column if not exists payment_method text;
alter table public.atlas_payment_requests add column if not exists manual_provider text;
alter table public.atlas_payment_requests add column if not exists metadata jsonb;
alter table public.atlas_payment_requests add column if not exists created_at timestamptz;
alter table public.atlas_payment_requests add column if not exists updated_at timestamptz;

update public.atlas_payment_requests set amount_mad = 0 where amount_mad is null;
update public.atlas_payment_requests set currency = 'MAD' where currency is null or trim(currency) = '';
update public.atlas_payment_requests set billing_period = 'year' where billing_period is null or trim(billing_period) = '';
update public.atlas_payment_requests set metadata = '{}'::jsonb where metadata is null;
update public.atlas_payment_requests set created_at = now() where created_at is null;
update public.atlas_payment_requests set updated_at = coalesce(created_at, now()) where updated_at is null;

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

comment on table public.atlas_payment_requests is
  'Manual checkout requests from /payment (CashPlus / WafaCash / Western Union). Service-role inserts bypass RLS.';
