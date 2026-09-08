-- Standalone affiliate portal: allow dedicated affiliate role on profiles.

alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles
set role = 'user'
where role is null or role not in ('user', 'moderator', 'admin', 'owner', 'affiliate');

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'moderator', 'admin', 'owner', 'affiliate'));
