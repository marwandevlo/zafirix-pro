-- Sprint B — profiles baseline (identity + access-control layer).
-- Idempotent: safe on fresh DB or existing partial `profiles` table.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user',
  plan text not null default 'free',
  status text not null default 'pending',
  full_name text not null default '',
  company_name text not null default '',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists status text not null default 'pending';
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists company_name text not null default '';
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

update public.profiles set role = 'user' where role is null or trim(role) = '';
update public.profiles set plan = 'free' where plan is null or trim(plan) = '';
update public.profiles set status = 'pending' where status is null or trim(status) = '';
update public.profiles set full_name = '' where full_name is null;
update public.profiles set company_name = '' where company_name is null;
update public.profiles set onboarding_completed = false where onboarding_completed is null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'admin', 'owner'));

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'vip', 'enterprise'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'approved'));

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.profiles_set_updated_at();

-- Prevent authenticated users from mutating privileged columns (service_role bypass).
create or replace function public.profiles_protect_privileged_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.plan := 'free';
    if new.status is null or new.status not in ('pending', 'active', 'suspended', 'approved') then
      new.status := 'pending';
    end if;
    return new;
  end if;

  new.role := old.role;
  new.plan := old.plan;
  new.status := old.status;
  new.email := coalesce(old.email, new.email);
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_fields on public.profiles;
create trigger profiles_protect_privileged_fields
  before insert or update on public.profiles
  for each row
  execute function public.profiles_protect_privileged_fields();

-- Auto-create profile row on signup.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    company_name,
    role,
    plan,
    status,
    onboarding_completed
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    'user',
    'free',
    'pending',
    false
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Backfill profiles for existing auth users missing a row.
insert into public.profiles (id, email, full_name, company_name, role, plan, status, onboarding_completed)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  coalesce(u.raw_user_meta_data->>'company_name', ''),
  'user',
  'free',
  'pending',
  false
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
