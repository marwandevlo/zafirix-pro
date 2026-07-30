-- Automated alert queue for WhatsApp / Email dispatch (invoice, debt, fiscal, inventory).
-- Idempotent.

create extension if not exists "pgcrypto";

create table if not exists public.zafirix_notification_queue (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  company_id       uuid        references public.atlas_companies (id) on delete cascade,
  channel          text        not null,
  category         text        not null,
  title            text        not null,
  body             text,
  recipient_email  text,
  recipient_phone  text,
  entity_type      text,
  entity_id        text,
  dedupe_key       text        not null,
  scheduled_at     timestamptz not null default now(),
  status           text        not null default 'pending',
  sent_at          timestamptz,
  error_message    text,
  metadata         jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint zafirix_notification_queue_channel_check
    check (channel in ('in_app','email','whatsapp')),
  constraint zafirix_notification_queue_status_check
    check (status in ('pending','processing','sent','failed','cancelled'))
);

create unique index if not exists zafirix_notification_queue_dedupe_idx
  on public.zafirix_notification_queue (dedupe_key)
  where status in ('pending', 'processing', 'sent');

create index if not exists zafirix_notification_queue_dispatch_idx
  on public.zafirix_notification_queue (status, scheduled_at)
  where status = 'pending';

create index if not exists zafirix_notification_queue_company_idx
  on public.zafirix_notification_queue (company_id, created_at desc);

alter table public.zafirix_notification_queue enable row level security;

drop policy if exists "zafirix_notification_queue_select_own" on public.zafirix_notification_queue;
create policy "zafirix_notification_queue_select_own"
  on public.zafirix_notification_queue for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "zafirix_notification_queue_service_role_all" on public.zafirix_notification_queue;
create policy "zafirix_notification_queue_service_role_all"
  on public.zafirix_notification_queue for all to service_role
  using (true) with check (true);

grant select on public.zafirix_notification_queue to authenticated;
grant all on public.zafirix_notification_queue to service_role;

notify pgrst, 'reload schema';
