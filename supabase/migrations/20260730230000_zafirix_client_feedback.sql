-- Client Feedback Score: satisfaction ratings, NPS, comments linked to invoices/projects.

create extension if not exists "pgcrypto";

-- ── Feedback requests (shareable via QuickShareHub token) ─────────────────────
create table if not exists public.zafirix_feedback_requests (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        references public.atlas_companies (id) on delete cascade,
  source_type     text        not null default 'manual',
  invoice_id      uuid        references public.atlas_invoices (id) on delete set null,
  project_id      uuid        references public.atlas_projects (id) on delete set null,
  client_id       uuid        references public.atlas_clients (id) on delete set null,
  client_name     text,
  client_email    text,
  client_phone    text,
  subject_label   text        not null,
  status          text        not null default 'pending',
  channel         text        not null default 'link',
  token           text        not null unique,
  share_link_id   uuid        references public.zafirix_share_links (id) on delete set null,
  sent_at         timestamptz,
  opened_at       timestamptz,
  completed_at    timestamptz,
  expires_at      timestamptz,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  constraint zafirix_feedback_requests_source_check
    check (source_type in ('invoice','project','manual')),
  constraint zafirix_feedback_requests_status_check
    check (status in ('pending','sent','opened','completed','expired')),
  constraint zafirix_feedback_requests_channel_check
    check (channel in ('link','whatsapp','email','manual'))
);

create index if not exists zafirix_feedback_requests_company_idx
  on public.zafirix_feedback_requests (company_id, created_at desc);

create index if not exists zafirix_feedback_requests_invoice_idx
  on public.zafirix_feedback_requests (invoice_id)
  where invoice_id is not null;

create index if not exists zafirix_feedback_requests_project_idx
  on public.zafirix_feedback_requests (project_id)
  where project_id is not null;

create index if not exists zafirix_feedback_requests_token_idx
  on public.zafirix_feedback_requests (token);

-- ── Feedback responses (one per request) ────────────────────────────────────────
create table if not exists public.zafirix_feedback_responses (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  company_id          uuid        references public.atlas_companies (id) on delete cascade,
  request_id          uuid        not null unique references public.zafirix_feedback_requests (id) on delete cascade,
  satisfaction_score  integer     not null,
  nps_score           integer     not null,
  comment             text,
  respondent_name     text,
  submitted_at        timestamptz not null default now(),
  metadata            jsonb       not null default '{}'::jsonb,
  constraint zafirix_feedback_responses_satisfaction_check
    check (satisfaction_score between 1 and 5),
  constraint zafirix_feedback_responses_nps_check
    check (nps_score between 0 and 10)
);

create index if not exists zafirix_feedback_responses_company_idx
  on public.zafirix_feedback_responses (company_id, submitted_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_feedback_requests',
    'zafirix_feedback_responses'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_feedback_responses' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.zafirix_feedback_requests r where r.id = request_id and r.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.zafirix_feedback_requests r where r.id = request_id and r.user_id = auth.uid()))',
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
