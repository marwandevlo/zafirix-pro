-- Corporate Governance & Board Minutes archive: meetings, resolutions, documents, board access.

create extension if not exists "pgcrypto";

-- ── Board member registry & access control ───────────────────────────────────
create table if not exists public.zafirix_board_members (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        not null references public.atlas_companies (id) on delete cascade,
  member_user_id  uuid        references auth.users (id) on delete set null,
  full_name       text        not null,
  email           text,
  board_role      text        not null default 'member',
  access_level    text        not null default 'read_only',
  status          text        not null default 'active',
  appointed_at    date,
  term_end        date,
  notes           text,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zafirix_board_members_role_check
    check (board_role in ('president','vice_president','secretary','treasurer','member','observer')),
  constraint zafirix_board_members_access_check
    check (access_level in ('full','read_only','restricted')),
  constraint zafirix_board_members_status_check
    check (status in ('active','inactive','terminated'))
);

create index if not exists zafirix_board_members_company_idx
  on public.zafirix_board_members (company_id, status);

create index if not exists zafirix_board_members_user_idx
  on public.zafirix_board_members (company_id, member_user_id)
  where member_user_id is not null;

-- ── Board meeting minutes ──────────────────────────────────────────────────────
create table if not exists public.zafirix_board_meetings (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  company_id        uuid        not null references public.atlas_companies (id) on delete cascade,
  reference_number  text        not null,
  meeting_date      date        not null default current_date,
  meeting_type      text        not null default 'ordinary',
  title             text        not null,
  location          text,
  quorum_present    boolean     not null default true,
  attendees         text[],
  agenda            text,
  minutes_body      text,
  decisions_summary text,
  access_tier       text        not null default 'board_confidential',
  status            text        not null default 'draft',
  file_url          text,
  file_name         text,
  approved_at       timestamptz,
  archived_at       timestamptz,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint zafirix_board_meetings_type_check
    check (meeting_type in ('ordinary','extraordinary','committee','strategy')),
  constraint zafirix_board_meetings_tier_check
    check (access_tier in ('public_internal','executive','board_confidential')),
  constraint zafirix_board_meetings_status_check
    check (status in ('draft','approved','archived'))
);

create unique index if not exists zafirix_board_meetings_ref_idx
  on public.zafirix_board_meetings (company_id, reference_number);

create index if not exists zafirix_board_meetings_company_date_idx
  on public.zafirix_board_meetings (company_id, meeting_date desc);

create index if not exists zafirix_board_meetings_search_idx
  on public.zafirix_board_meetings (company_id, title, reference_number);

-- ── Shareholder resolutions (AGO/AGE) ─────────────────────────────────────────
create table if not exists public.zafirix_shareholder_resolutions (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  company_id            uuid        not null references public.atlas_companies (id) on delete cascade,
  reference_number      text        not null,
  resolution_date       date        not null default current_date,
  assembly_type         text        not null default 'ago',
  title                 text        not null,
  resolution_text       text        not null,
  votes_for             integer,
  votes_against         integer,
  votes_abstain         integer,
  quorum_pct            numeric(5,2),
  capital_represented_pct numeric(5,2),
  access_tier           text        not null default 'executive',
  status                text        not null default 'adopted',
  file_url              text,
  file_name             text,
  meeting_id            uuid        references public.zafirix_board_meetings (id) on delete set null,
  archived_at           timestamptz,
  metadata              jsonb       not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint zafirix_shareholder_resolutions_assembly_check
    check (assembly_type in ('ago','age','unanimous_written','board_decision')),
  constraint zafirix_shareholder_resolutions_tier_check
    check (access_tier in ('public_internal','executive','board_confidential')),
  constraint zafirix_shareholder_resolutions_status_check
    check (status in ('draft','adopted','filed','archived'))
);

create unique index if not exists zafirix_shareholder_resolutions_ref_idx
  on public.zafirix_shareholder_resolutions (company_id, reference_number);

create index if not exists zafirix_shareholder_resolutions_company_date_idx
  on public.zafirix_shareholder_resolutions (company_id, resolution_date desc);

create index if not exists zafirix_shareholder_resolutions_search_idx
  on public.zafirix_shareholder_resolutions (company_id, title, reference_number);

-- ── Corporate governance documents ─────────────────────────────────────────────
create table if not exists public.zafirix_governance_documents (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        not null references public.atlas_companies (id) on delete cascade,
  document_type   text        not null default 'policy',
  title           text        not null,
  description     text,
  version_label   text,
  effective_date  date,
  review_date     date,
  access_tier     text        not null default 'executive',
  status          text        not null default 'active',
  file_url        text,
  file_name       text,
  tags            text[]      not null default '{}',
  archived_at     timestamptz,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zafirix_governance_documents_type_check
    check (document_type in (
      'charter','bylaws','internal_regulation','committee_charter',
      'ethics_code','policy','risk_charter','audit_committee','other'
    )),
  constraint zafirix_governance_documents_tier_check
    check (access_tier in ('public_internal','executive','board_confidential')),
  constraint zafirix_governance_documents_status_check
    check (status in ('active','superseded','archived'))
);

create index if not exists zafirix_governance_documents_company_idx
  on public.zafirix_governance_documents (company_id, document_type, status);

create index if not exists zafirix_governance_documents_search_idx
  on public.zafirix_governance_documents (company_id, title);

-- ── Access audit log ───────────────────────────────────────────────────────────
create table if not exists public.zafirix_governance_access_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  company_id    uuid        not null references public.atlas_companies (id) on delete cascade,
  actor_user_id uuid        not null,
  action        text        not null,
  entity_type   text        not null,
  entity_id     uuid,
  entity_title  text,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  constraint zafirix_governance_access_log_action_check
    check (action in ('view','search','create','update','archive','export','access_denied')),
  constraint zafirix_governance_access_log_entity_check
    check (entity_type in ('meeting','resolution','document','board_member','archive'))
);

create index if not exists zafirix_governance_access_log_company_idx
  on public.zafirix_governance_access_log (company_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_board_members',
    'zafirix_board_meetings',
    'zafirix_shareholder_resolutions',
    'zafirix_governance_documents',
    'zafirix_governance_access_log'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_governance_access_log' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated using (auth.uid() = user_id)',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated with check (auth.uid() = user_id)',
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
