-- =============================================================================
-- GA Fix — profiles validation: admin approval must persist
--
-- Root causes fixed:
-- 1) profiles_protect_privileged_fields relied only on auth.role() to detect
--    privileged callers. auth.role() can return NULL for service-role
--    connections (new secret keys, direct connections, SECURITY DEFINER
--    contexts), silently reverting role/plan/status on admin updates.
--    -> Detect privilege via current_user as the primary signal.
-- 2) Conflicting profiles_status_check definitions between the baseline
--    migration ('approved', no 'banned') and fix-signup-trigger.sql
--    ('banned', no 'approved'). The app uses 'banned' for rejection.
--    -> Canonical set: pending / active / suspended / banned.
--    -> Legacy 'approved' rows migrated to 'active'.
-- 3) profiles_role_check omitted 'moderator' which the admin UI offers.
--    -> Canonical set: user / moderator / admin / owner.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Migrate legacy status values BEFORE tightening the constraint
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set status = 'active' where status = 'approved';
update public.profiles set status = 'pending'
  where status is null or status not in ('pending', 'active', 'suspended', 'banned');

update public.profiles set role = 'user'
  where role is null or role not in ('user', 'moderator', 'admin', 'owner');

-- -----------------------------------------------------------------------------
-- 2) Canonical CHECK constraints (single source of truth)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'banned'));

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'moderator', 'admin', 'owner'));

-- -----------------------------------------------------------------------------
-- 3) Privileged-field protection with RELIABLE service detection.
--    current_user is deterministic:
--      - PostgREST with the service key runs as `service_role`
--      - SECURITY DEFINER signup triggers run as their owner (postgres /
--        supabase_admin / supabase_auth_admin)
--    auth.role() kept as a secondary signal for backwards compatibility.
-- -----------------------------------------------------------------------------
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
    if new.status is null or new.status not in ('pending', 'active', 'suspended', 'banned') then
      new.status := 'pending';
    end if;
    return new;
  end if;

  -- Authenticated users may edit identity fields only; privileged columns are
  -- frozen to their previous values.
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

-- =============================================================================
-- VERIFY (run manually):
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.profiles'::regclass and contype = 'c';
--
--   -- As service role, this must persist:
--   -- update public.profiles set status = 'active' where id = '<pending-user-id>';
--   -- select status from public.profiles where id = '<pending-user-id>';
-- =============================================================================
