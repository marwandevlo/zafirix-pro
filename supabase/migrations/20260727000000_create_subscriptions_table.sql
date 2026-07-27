-- Ensure public.subscriptions exists for admin / manual / Paddle billing flows.
-- Idempotent: safe to re-run on projects that never applied 20260506120000 / extensions.
-- Service-role API routes bypass RLS; policies cover direct authenticated reads.

create extension if not exists "pgcrypto";

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text,
  plan text not null default 'starter',
  status text not null default 'pending_manual',
  payment_method text not null default 'manual',
  notes text,
  paddle_subscription_id text,
  company_limit integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Heal partial / legacy schemas (e.g. admin-backoffice.sql used plan_slug, no updated_at).
alter table public.subscriptions add column if not exists user_email text;
alter table public.subscriptions add column if not exists plan text;
alter table public.subscriptions add column if not exists status text;
alter table public.subscriptions add column if not exists payment_method text;
alter table public.subscriptions add column if not exists notes text;
alter table public.subscriptions add column if not exists paddle_subscription_id text;
alter table public.subscriptions add column if not exists company_limit integer;
alter table public.subscriptions add column if not exists created_at timestamptz;
alter table public.subscriptions add column if not exists updated_at timestamptz;
alter table public.subscriptions add column if not exists plan_slug text;
alter table public.subscriptions add column if not exists starts_at timestamptz;
alter table public.subscriptions add column if not exists ends_at timestamptz;

-- Backfill plan from legacy plan_slug when plan is empty.
update public.subscriptions
set plan = nullif(trim(plan_slug), '')
where (plan is null or trim(plan) = '')
  and plan_slug is not null
  and trim(plan_slug) <> '';

update public.subscriptions set plan = 'starter' where plan is null or trim(plan) = '';
update public.subscriptions set status = 'pending_manual' where status is null or trim(status) = '';
update public.subscriptions set payment_method = 'manual' where payment_method is null or trim(payment_method) = '';
update public.subscriptions set created_at = now() where created_at is null;
update public.subscriptions set updated_at = coalesce(created_at, now()) where updated_at is null;

do $body$
begin
  alter table public.subscriptions alter column plan set not null;
exception when others then null;
end
$body$;

do $body$
begin
  alter table public.subscriptions alter column status set not null;
exception when others then null;
end
$body$;

do $body$
begin
  alter table public.subscriptions alter column payment_method set not null;
exception when others then null;
end
$body$;

do $body$
begin
  alter table public.subscriptions alter column created_at set default now();
  alter table public.subscriptions alter column created_at set not null;
exception when others then null;
end
$body$;

do $body$
begin
  alter table public.subscriptions alter column updated_at set default now();
  alter table public.subscriptions alter column updated_at set not null;
exception when others then null;
end
$body$;

-- Drop existing CHECK constraints on subscriptions so we can re-apply the canonical set.
do $body$
declare cname text;
begin
  for cname in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public' and t.relname = 'subscriptions' and c.contype = 'c'
  loop
    execute format('alter table public.subscriptions drop constraint if exists %I', cname);
  end loop;
end
$body$;

alter table public.subscriptions add constraint subscriptions_plan_check
  check (
    plan in (
      'starter',
      'growth',
      'pro',
      'business',
      'advanced',
      'enterprise',
      'cabinet'
    )
  );

alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trial', 'pending_manual', 'active', 'canceled'));

alter table public.subscriptions add constraint subscriptions_payment_method_check
  check (payment_method in ('manual', 'paddle'));

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_created_idx on public.subscriptions (status, created_at desc);

create unique index if not exists subscriptions_paddle_subscription_uidx
  on public.subscriptions (paddle_subscription_id)
  where paddle_subscription_id is not null and length(trim(paddle_subscription_id)) > 0;

alter table public.subscriptions enable row level security;

-- Authenticated users may read their own rows.
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Admin JWT (app_metadata.role=admin) may read all rows.
drop policy if exists "subscriptions_admin_select" on public.subscriptions;
create policy "subscriptions_admin_select"
  on public.subscriptions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Profiles-based admin/owner full access (matches admin-backoffice patterns).
drop policy if exists "subscriptions_admin_all" on public.subscriptions;
create policy "subscriptions_admin_all"
  on public.subscriptions for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'owner')
    )
  );

-- Note: service_role bypasses RLS entirely; admin API routes must use SUPABASE_SERVICE_ROLE_KEY.
comment on table public.subscriptions is
  'Manual + Paddle subscription requests (admin /api/admin/subscriptions). Distinct from atlas_subscriptions entitlements.';
