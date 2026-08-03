-- Re-assert platform owner super-admin profile (enterprise backend control).
-- Idempotent: safe to re-run after deploy or email correction.

update public.profiles
set
  role = 'owner',
  plan = 'enterprise',
  status = 'active',
  updated_at = now()
where lower(trim(coalesce(email, ''))) = 'maizimarouane1991@gmail.com'
  and (
    role is distinct from 'owner'
    or plan is distinct from 'enterprise'
    or status is distinct from 'active'
  );

-- Ensure profiles.role check includes moderator (GA migration should already have this).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'moderator', 'admin', 'owner'));
