-- =============================================================================
-- ZAFIRIX PRO — Fix signup: single auth.users trigger + profiles constraints
-- Run in Supabase SQL Editor (production/staging). Safe to re-run where noted.
--
-- Goals:
-- - Trigger creates public.profiles on auth.users INSERT (SECURITY DEFINER)
-- - Owner email → owner / enterprise / active
-- - Everyone else → user / free / pending
-- - Frontend must NOT write role, plan, status
--
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Drop legacy triggers on auth.users (names requested + common variants)
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists create_profile_trigger on auth.users;

-- -----------------------------------------------------------------------------
-- 2) Drop legacy functions (CASCADE removes any remaining dependencies)
-- -----------------------------------------------------------------------------
drop function if exists public.handle_new_user_profile() cascade;
drop function if exists public.create_profile() cascade;

-- Replace canonical handler (drop first so signature conflicts are avoided)
drop function if exists public.handle_new_user() cascade;

-- -----------------------------------------------------------------------------
-- 3) Ensure profiles table exists with correct constraints & defaults
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  company text,
  avatar_url text,
  role text not null default 'user',
  plan text not null default 'free',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login timestamptz
);

-- Drop known CHECK constraint names from older schema (ignore if missing)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'moderator', 'user'));

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'vip', 'enterprise'));

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'banned'));

alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column plan set default 'free';
alter table public.profiles alter column status set default 'pending';

-- -----------------------------------------------------------------------------
-- 4) Single canonical function + trigger on auth.users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Owner bootstrap (immutable super-admin row)
  if lower(coalesce(new.email, '')) = 'maizimarouane1991@gmail.com' then
    insert into public.profiles (id, email, role, plan, status)
    values (new.id, new.email, 'owner', 'enterprise', 'active')
    on conflict (id) do update
      set email = excluded.email,
          role = 'owner',
          plan = 'enterprise',
          status = 'active';
    return new;
  end if;

  -- Normal signup: pending until admin approval
  insert into public.profiles (id, email, role, plan, status)
  values (new.id, new.email, 'user', 'free', 'pending')
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- =============================================================================
-- TEST / VERIFY (run manually after applying)
-- =============================================================================
-- List triggers on auth.users:
--   select tgname, tgtype, tgenabled
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
--
-- List CHECK constraints on public.profiles:
--   select conname, pg_get_constraintdef(oid) as def
--   from pg_constraint
--   where conrelid = 'public.profiles'::regclass and contype = 'c';
-- =============================================================================
