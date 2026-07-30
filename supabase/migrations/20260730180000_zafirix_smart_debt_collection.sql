-- Smart debt collection: follow-up history, client risk profiles, aging tracking.

create extension if not exists "pgcrypto";

alter table public.zafirix_debt_collection_cases
  add column if not exists client_id uuid references public.atlas_clients (id) on delete set null,
  add column if not exists invoice_number text,
  add column if not exists due_date date,
  add column if not exists days_overdue integer not null default 0,
  add column if not exists aging_bucket text not null default 'current',
  add column if not exists outstanding_amount numeric(14,2) not null default 0,
  add column if not exists paid_amount numeric(14,2) not null default 0;

alter table public.zafirix_debt_collection_cases
  drop constraint if exists zafirix_debt_aging_bucket_check;
alter table public.zafirix_debt_collection_cases
  add constraint zafirix_debt_aging_bucket_check
    check (aging_bucket in ('current','1-30','31-60','61-90','90+'));

create index if not exists zafirix_debt_collection_aging_idx
  on public.zafirix_debt_collection_cases (company_id, aging_bucket, stage);

-- ── Follow-up history ─────────────────────────────────────────────────────────
create table if not exists public.zafirix_debt_follow_ups (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  case_id      uuid        not null references public.zafirix_debt_collection_cases (id) on delete cascade,
  channel      text        not null,
  recipient    text,
  stage        text        not null,
  message      text        not null,
  status       text        not null default 'sent',
  sent_at      timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint zafirix_debt_follow_ups_channel_check
    check (channel in ('email','whatsapp','in_app','manual')),
  constraint zafirix_debt_follow_ups_status_check
    check (status in ('sent','failed','pending'))
);

create index if not exists zafirix_debt_follow_ups_case_idx
  on public.zafirix_debt_follow_ups (case_id, sent_at desc);

-- ── Client risk profiles ──────────────────────────────────────────────────────
create table if not exists public.zafirix_client_risk_profiles (
  id                 uuid          primary key default gen_random_uuid(),
  user_id            uuid          not null references auth.users (id) on delete cascade,
  company_id         uuid          references public.atlas_companies (id) on delete cascade,
  client_id          uuid          references public.atlas_clients (id) on delete set null,
  client_name        text          not null,
  risk_score         integer       not null default 0,
  risk_band          text          not null default 'low',
  total_outstanding  numeric(14,2) not null default 0,
  overdue_count      integer       not null default 0,
  max_days_overdue   integer       not null default 0,
  last_payment_at    timestamptz,
  metadata           jsonb         not null default '{}'::jsonb,
  updated_at         timestamptz   not null default now(),
  created_at         timestamptz   not null default now(),
  constraint zafirix_client_risk_band_check
    check (risk_band in ('low','medium','high','critical'))
);

create unique index if not exists zafirix_client_risk_profiles_name_idx
  on public.zafirix_client_risk_profiles (company_id, client_name);

create index if not exists zafirix_client_risk_profiles_score_idx
  on public.zafirix_client_risk_profiles (company_id, risk_score desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array['zafirix_debt_follow_ups', 'zafirix_client_risk_profiles'] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_debt_follow_ups' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.zafirix_debt_collection_cases c where c.id = case_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.zafirix_debt_collection_cases c where c.id = case_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
    else
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
    end if;

    execute format(
      'create policy "%s_service_role_all" on public.%I for all to service_role using (true) with check (true)',
      tbl, tbl
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
  end loop;
end $$;

notify pgrst, 'reload schema';
