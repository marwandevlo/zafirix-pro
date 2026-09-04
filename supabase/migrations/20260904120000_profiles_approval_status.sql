-- =============================================================================
-- Admin approval lifecycle — explicit profiles.status values
--
-- Canonical stored values remain:
--   pending | active | suspended | banned
--
-- Aliases accepted by the admin approve/reject APIs:
--   approved  → persisted as active
--   rejected  → persisted as banned
--
-- The CHECK constraint also allows the aliases so a direct write of
-- 'approved' / 'rejected' does not fail (normalizeStatus maps them).
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.profiles add column if not exists status text not null default 'pending';

update public.profiles
  set status = 'pending'
  where status is null or trim(status) = '';

-- Keep existing access semantics: approved → active, rejected → banned.
update public.profiles set status = 'active' where lower(trim(status)) = 'approved';
update public.profiles set status = 'banned' where lower(trim(status)) = 'rejected';

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active', 'approved', 'rejected', 'suspended', 'banned'));

create index if not exists profiles_status_idx on public.profiles (status);

create or replace function public.profiles_protect_privileged_fields()
returns trigger
language plpgsql
as $$
declare
  jwt_role text := '';
begin
  begin
    jwt_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  exception when others then
    jwt_role := '';
  end;

  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
     or jwt_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.plan := 'free';
    if new.status is null or new.status not in ('pending', 'active', 'approved', 'rejected', 'suspended', 'banned') then
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
