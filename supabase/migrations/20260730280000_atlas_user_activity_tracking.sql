-- User presence (last_seen) and detailed activity audit trail for admin monitoring.

create extension if not exists "pgcrypto";

-- ── Profile presence columns ─────────────────────────────────────────────────
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  add column if not exists last_login timestamptz;

create index if not exists profiles_last_seen_at_idx
  on public.profiles (last_seen_at desc nulls last);

-- ── User activity log ────────────────────────────────────────────────────────
create table if not exists public.atlas_user_activity (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  action_type  text        not null,
  summary      text        not null,
  entity_type  text,
  entity_id    uuid,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists atlas_user_activity_user_created_idx
  on public.atlas_user_activity (user_id, created_at desc);

create index if not exists atlas_user_activity_created_idx
  on public.atlas_user_activity (created_at desc);

create index if not exists atlas_user_activity_action_idx
  on public.atlas_user_activity (action_type, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.atlas_user_activity enable row level security;

drop policy if exists atlas_user_activity_select_own on public.atlas_user_activity;
drop policy if exists atlas_user_activity_service_role_all on public.atlas_user_activity;

create policy atlas_user_activity_select_own
  on public.atlas_user_activity
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy atlas_user_activity_service_role_all
  on public.atlas_user_activity
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.atlas_user_activity to authenticated;
grant all on public.atlas_user_activity to service_role;

notify pgrst, 'reload schema';
