-- Immutable admin audit trail (service role writes from API routes only).
create extension if not exists "pgcrypto";

create table if not exists public.atlas_admin_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists atlas_admin_logs_created_at_idx on public.atlas_admin_logs (created_at desc);
create index if not exists atlas_admin_logs_actor_idx on public.atlas_admin_logs (actor_user_id);
create index if not exists atlas_admin_logs_action_idx on public.atlas_admin_logs (action);

alter table public.atlas_admin_logs enable row level security;

-- No policies: authenticated/anon JWT cannot read or write. Service role bypasses RLS.

comment on table public.atlas_admin_logs is 'Admin actions audit; insert only from trusted server routes using service role.';
