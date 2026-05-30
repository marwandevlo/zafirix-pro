-- Agents IA — conversations, messages, tasks (real persistence).

create extension if not exists "pgcrypto";

create table if not exists public.atlas_agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.atlas_companies (id) on delete set null,
  agent_type text not null,
  title text not null default '',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_agent_conversations_agent_type_check
    check (agent_type in ('fiscal', 'comptable', 'juridique', 'rh', 'business'))
);

create index if not exists atlas_agent_conversations_user_idx
  on public.atlas_agent_conversations (user_id);
create index if not exists atlas_agent_conversations_company_idx
  on public.atlas_agent_conversations (company_id);
create index if not exists atlas_agent_conversations_type_idx
  on public.atlas_agent_conversations (user_id, agent_type);

create table if not exists public.atlas_agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.atlas_agent_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint atlas_agent_messages_role_check
    check (role in ('user', 'assistant', 'system'))
);

create index if not exists atlas_agent_messages_conversation_idx
  on public.atlas_agent_messages (conversation_id, created_at);
create index if not exists atlas_agent_messages_user_idx
  on public.atlas_agent_messages (user_id);

create table if not exists public.atlas_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.atlas_companies (id) on delete set null,
  conversation_id uuid references public.atlas_agent_conversations (id) on delete set null,
  agent_type text not null,
  task_kind text not null default 'message',
  status text not null default 'pending',
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint atlas_agent_tasks_agent_type_check
    check (agent_type in ('fiscal', 'comptable', 'juridique', 'rh', 'business')),
  constraint atlas_agent_tasks_status_check
    check (status in ('pending', 'running', 'done', 'failed'))
);

create index if not exists atlas_agent_tasks_user_idx on public.atlas_agent_tasks (user_id);
create index if not exists atlas_agent_tasks_company_idx on public.atlas_agent_tasks (company_id);
create index if not exists atlas_agent_tasks_conversation_idx on public.atlas_agent_tasks (conversation_id);
create index if not exists atlas_agent_tasks_status_idx on public.atlas_agent_tasks (user_id, status);

-- RLS
alter table public.atlas_agent_conversations enable row level security;
alter table public.atlas_agent_messages enable row level security;
alter table public.atlas_agent_tasks enable row level security;

drop policy if exists "atlas_agent_conversations_select_own" on public.atlas_agent_conversations;
create policy "atlas_agent_conversations_select_own"
  on public.atlas_agent_conversations for select using (auth.uid() = user_id);

drop policy if exists "atlas_agent_conversations_insert_own" on public.atlas_agent_conversations;
create policy "atlas_agent_conversations_insert_own"
  on public.atlas_agent_conversations for insert with check (auth.uid() = user_id);

drop policy if exists "atlas_agent_conversations_update_own" on public.atlas_agent_conversations;
create policy "atlas_agent_conversations_update_own"
  on public.atlas_agent_conversations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "atlas_agent_conversations_delete_own" on public.atlas_agent_conversations;
create policy "atlas_agent_conversations_delete_own"
  on public.atlas_agent_conversations for delete using (auth.uid() = user_id);

drop policy if exists "atlas_agent_messages_select_own" on public.atlas_agent_messages;
create policy "atlas_agent_messages_select_own"
  on public.atlas_agent_messages for select using (auth.uid() = user_id);

drop policy if exists "atlas_agent_messages_insert_own" on public.atlas_agent_messages;
create policy "atlas_agent_messages_insert_own"
  on public.atlas_agent_messages for insert with check (auth.uid() = user_id);

drop policy if exists "atlas_agent_messages_delete_own" on public.atlas_agent_messages;
create policy "atlas_agent_messages_delete_own"
  on public.atlas_agent_messages for delete using (auth.uid() = user_id);

drop policy if exists "atlas_agent_tasks_select_own" on public.atlas_agent_tasks;
create policy "atlas_agent_tasks_select_own"
  on public.atlas_agent_tasks for select using (auth.uid() = user_id);

drop policy if exists "atlas_agent_tasks_insert_own" on public.atlas_agent_tasks;
create policy "atlas_agent_tasks_insert_own"
  on public.atlas_agent_tasks for insert with check (auth.uid() = user_id);

drop policy if exists "atlas_agent_tasks_update_own" on public.atlas_agent_tasks;
create policy "atlas_agent_tasks_update_own"
  on public.atlas_agent_tasks for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "atlas_agent_tasks_delete_own" on public.atlas_agent_tasks;
create policy "atlas_agent_tasks_delete_own"
  on public.atlas_agent_tasks for delete using (auth.uid() = user_id);
