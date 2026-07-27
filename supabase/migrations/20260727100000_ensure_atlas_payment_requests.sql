-- Ensure public.atlas_payment_requests matches /payment + /admin/manual-payments.
-- Idempotent. Safe if you already ran a simplified schema (amount, no manual_provider).
--
-- App insert shape (service-role):
--   plan_id, amount_mad, currency, billing_period,
--   payment_method='manual', manual_provider='cashplus'|'wafacash'|'western_union',
--   status='pending'|'paid'|'rejected', metadata, created_at, updated_at

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

  payment_method text not null default 'manual',
  manual_provider text,

  status public.atlas_payment_request_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Heal simplified / alternate schemas
alter table public.atlas_payment_requests add column if not exists plan_id text;
alter table public.atlas_payment_requests add column if not exists amount_mad numeric;
alter table public.atlas_payment_requests add column if not exists amount numeric;
alter table public.atlas_payment_requests add column if not exists currency text;
alter table public.atlas_payment_requests add column if not exists billing_period text;
alter table public.atlas_payment_requests add column if not exists payment_method text;
alter table public.atlas_payment_requests add column if not exists manual_provider text;
alter table public.atlas_payment_requests add column if not exists metadata jsonb;
alter table public.atlas_payment_requests add column if not exists created_at timestamptz;
alter table public.atlas_payment_requests add column if not exists updated_at timestamptz;

-- If legacy column `amount` was used, copy into amount_mad
update public.atlas_payment_requests
set amount_mad = amount
where (amount_mad is null or amount_mad = 0)
  and amount is not null;

-- If payment_method stored the channel (cashplus/wafacash/virement), move to manual_provider
update public.atlas_payment_requests
set
  manual_provider = case
    when lower(payment_method) in ('cashplus', 'wafacash', 'western_union', 'virement') then lower(payment_method)
    else manual_provider
  end,
  payment_method = case
    when lower(payment_method) in ('cashplus', 'wafacash', 'western_union', 'virement') then 'manual'
    else coalesce(nullif(trim(payment_method), ''), 'manual')
  end
where payment_method is not null;

update public.atlas_payment_requests set amount_mad = 0 where amount_mad is null;
update public.atlas_payment_requests set currency = 'MAD' where currency is null or trim(currency) = '';
update public.atlas_payment_requests set billing_period = 'year' where billing_period is null or trim(billing_period) = '';
update public.atlas_payment_requests set payment_method = 'manual' where payment_method is null or trim(payment_method) = '';
update public.atlas_payment_requests set metadata = '{}'::jsonb where metadata is null;
update public.atlas_payment_requests set created_at = now() where created_at is null;
update public.atlas_payment_requests set updated_at = coalesce(created_at, now()) where updated_at is null;

-- Normalize free-text status into enum-compatible values when column is text
do $body$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atlas_payment_requests'
      and column_name = 'status'
      and udt_name = 'text'
  ) then
    update public.atlas_payment_requests
    set status = case lower(coalesce(status, 'pending'))
      when 'paid' then 'paid'
      when 'rejected' then 'rejected'
      when 'canceled' then 'rejected'
      when 'cancelled' then 'rejected'
      when 'pending_manual' then 'pending'
      when 'pending_payment' then 'pending'
      else 'pending'
    end;
  end if;
end
$body$;

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

-- Users: insert/select own rows
drop policy if exists "Users can insert their own payment requests" on public.atlas_payment_requests;
drop policy if exists "Users can view their own payment requests" on public.atlas_payment_requests;
drop policy if exists "Service role full access" on public.atlas_payment_requests;
drop policy if exists "atlas_payment_requests_select_own" on public.atlas_payment_requests;
drop policy if exists "atlas_payment_requests_insert_own" on public.atlas_payment_requests;
drop policy if exists "atlas_payment_requests_admin_update" on public.atlas_payment_requests;
drop policy if exists "atlas_payment_requests_admin_select" on public.atlas_payment_requests;

create policy "atlas_payment_requests_select_own"
  on public.atlas_payment_requests for select
  to authenticated
  using (auth.uid() = user_id);

create policy "atlas_payment_requests_insert_own"
  on public.atlas_payment_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Admin JWT (app_metadata.role=admin) can read/update all
create policy "atlas_payment_requests_admin_select"
  on public.atlas_payment_requests for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "atlas_payment_requests_admin_update"
  on public.atlas_payment_requests for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- NOTE: Supabase service_role already bypasses RLS.
-- Explicit policy kept for clarity / dashboard tooling.
create policy "atlas_payment_requests_service_role_all"
  on public.atlas_payment_requests for all
  to service_role
  using (true)
  with check (true);

comment on table public.atlas_payment_requests is
  'Manual checkout from /payment. Channels live in manual_provider; payment_method is usually manual.';
