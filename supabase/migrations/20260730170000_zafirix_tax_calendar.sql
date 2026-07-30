-- Interactive tax calendar: persisted deadlines, compliance events, notification preferences.

create extension if not exists "pgcrypto";

-- ── Tax deadlines (synced from fiscal engine + user overrides) ────────────────
create table if not exists public.zafirix_tax_deadlines (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  company_id     uuid        references public.atlas_companies (id) on delete cascade,
  deadline_key   text        not null,
  category       text        not null,
  label_fr       text        not null,
  label_ar       text        not null default '',
  due_date       date        not null,
  href           text        not null default '/',
  external_url   text,
  period_label   text,
  status         text        not null default 'upcoming',
  filed_at       timestamptz,
  metadata       jsonb       not null default '{}'::jsonb,
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint zafirix_tax_deadlines_category_check
    check (category in ('tva','is','ir','cnss','depot_legal','patente','acompte_is')),
  constraint zafirix_tax_deadlines_status_check
    check (status in ('upcoming','due_soon','overdue','filed','waived'))
);

create unique index if not exists zafirix_tax_deadlines_company_key_idx
  on public.zafirix_tax_deadlines (company_id, deadline_key);

create index if not exists zafirix_tax_deadlines_due_idx
  on public.zafirix_tax_deadlines (company_id, due_date, status);

-- ── Compliance events (reminders sent, filings, misses) ─────────────────────
create table if not exists public.zafirix_compliance_events (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  company_id     uuid        references public.atlas_companies (id) on delete set null,
  deadline_id    uuid        references public.zafirix_tax_deadlines (id) on delete set null,
  deadline_key   text,
  category       text,
  event_type     text        not null,
  channel        text,
  title          text        not null,
  body           text,
  metadata       jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint zafirix_compliance_events_type_check
    check (event_type in (
      'reminder_sent','deadline_filed','deadline_missed','alert_email',
      'alert_whatsapp','alert_in_app','sync','preference_updated'
    ))
);

create index if not exists zafirix_compliance_events_company_idx
  on public.zafirix_compliance_events (company_id, created_at desc);

create index if not exists zafirix_compliance_events_deadline_idx
  on public.zafirix_compliance_events (deadline_id, event_type);

-- ── Notification preferences (managers + accountants) ─────────────────────────
create table if not exists public.zafirix_notification_preferences (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id) on delete cascade,
  company_id         uuid        references public.atlas_companies (id) on delete cascade,
  email_enabled      boolean     not null default true,
  whatsapp_enabled   boolean     not null default true,
  in_app_enabled     boolean     not null default true,
  alert_days         integer[]   not null default '{21,14,7,3,1}',
  categories         text[]      not null default '{tva,is,ir,cnss,acompte_is}',
  accountant_email   text,
  accountant_phone   text,
  accountant_name    text,
  manager_email      text,
  manager_phone      text,
  timezone           text        not null default 'Africa/Casablanca',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists zafirix_notification_preferences_user_company_idx
  on public.zafirix_notification_preferences (user_id, company_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_tax_deadlines',
    'zafirix_compliance_events',
    'zafirix_notification_preferences'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    execute format(
      'create policy "%s_select_own" on public.%I for select to authenticated using (auth.uid() = user_id)',
      tbl, tbl
    );
    execute format(
      'create policy "%s_insert_own" on public.%I for insert to authenticated with check (auth.uid() = user_id)',
      tbl, tbl
    );
    execute format(
      'create policy "%s_update_own" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      tbl, tbl
    );
    execute format(
      'create policy "%s_delete_own" on public.%I for delete to authenticated using (auth.uid() = user_id)',
      tbl, tbl
    );
    execute format(
      'create policy "%s_service_role_all" on public.%I for all to service_role using (true) with check (true)',
      tbl, tbl
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
  end loop;
end $$;

notify pgrst, 'reload schema';
