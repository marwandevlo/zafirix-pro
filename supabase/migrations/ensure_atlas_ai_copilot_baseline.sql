-- Baseline: AI copilot tables (idempotent).
-- Run when production Supabase never applied phase13 migrations.
-- Fixes: "Could not find table atlas_ai_interactions / atlas_ai_anomalies in schema cache"

create extension if not exists "pgcrypto";

create table if not exists public.atlas_ai_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  fiscal_year int,
  context_json jsonb not null default '{}',
  sources_snapshot jsonb not null default '[]',
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, fiscal_year)
);

create index if not exists idx_ai_context_user on public.atlas_ai_context (user_id, refreshed_at desc);

create table if not exists public.atlas_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  title text not null default 'Conversation',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user on public.atlas_ai_conversations (user_id, updated_at desc);

create table if not exists public.atlas_ai_anomalies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  category text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  description text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_anomalies_user_sev on public.atlas_ai_anomalies (user_id, severity, detected_at desc);
create index if not exists idx_ai_anomalies_open on public.atlas_ai_anomalies (user_id, status) where status = 'open';
create index if not exists idx_ai_anomalies_company on public.atlas_ai_anomalies (company_id) where company_id is not null;

create table if not exists public.atlas_ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  conversation_id uuid references public.atlas_ai_conversations(id) on delete set null,
  interaction_type text not null default 'chat'
    check (interaction_type in ('chat', 'explain', 'audit', 'readiness', 'insight', 'voice_summary', 'executive_summary', 'closing')),
  prompt text not null,
  answer text not null,
  sources_used jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_interactions_user on public.atlas_ai_interactions (user_id, created_at desc);
create index if not exists idx_ai_interactions_conversation on public.atlas_ai_interactions (conversation_id, created_at);

-- Expand interaction_type if table pre-existed with older constraint
alter table public.atlas_ai_interactions
  drop constraint if exists atlas_ai_interactions_interaction_type_check;
alter table public.atlas_ai_interactions
  add constraint atlas_ai_interactions_interaction_type_check
  check (interaction_type in ('chat', 'explain', 'audit', 'readiness', 'insight', 'voice_summary', 'executive_summary', 'closing'));

alter table public.atlas_ai_context enable row level security;
alter table public.atlas_ai_conversations enable row level security;
alter table public.atlas_ai_anomalies enable row level security;
alter table public.atlas_ai_interactions enable row level security;

drop policy if exists "atlas_ai_context_own" on public.atlas_ai_context;
create policy "atlas_ai_context_own" on public.atlas_ai_context for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "atlas_ai_conversations_own" on public.atlas_ai_conversations;
create policy "atlas_ai_conversations_own" on public.atlas_ai_conversations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "atlas_ai_anomalies_own" on public.atlas_ai_anomalies;
create policy "atlas_ai_anomalies_own" on public.atlas_ai_anomalies for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "atlas_ai_interactions_own" on public.atlas_ai_interactions;
create policy "atlas_ai_interactions_own" on public.atlas_ai_interactions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "atlas_ai_context_service_role_all" on public.atlas_ai_context;
create policy "atlas_ai_context_service_role_all" on public.atlas_ai_context for all to service_role using (true) with check (true);

drop policy if exists "atlas_ai_conversations_service_role_all" on public.atlas_ai_conversations;
create policy "atlas_ai_conversations_service_role_all" on public.atlas_ai_conversations for all to service_role using (true) with check (true);

drop policy if exists "atlas_ai_anomalies_service_role_all" on public.atlas_ai_anomalies;
create policy "atlas_ai_anomalies_service_role_all" on public.atlas_ai_anomalies for all to service_role using (true) with check (true);

drop policy if exists "atlas_ai_interactions_service_role_all" on public.atlas_ai_interactions;
create policy "atlas_ai_interactions_service_role_all" on public.atlas_ai_interactions for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.atlas_ai_context to authenticated;
grant select, insert, update, delete on public.atlas_ai_conversations to authenticated;
grant select, insert, update, delete on public.atlas_ai_anomalies to authenticated;
grant select, insert, update, delete on public.atlas_ai_interactions to authenticated;

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';
