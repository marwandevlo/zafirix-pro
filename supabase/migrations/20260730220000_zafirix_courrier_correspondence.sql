-- Courrier Arrivé/Départ: administrative correspondence archive with attachments.

create extension if not exists "pgcrypto";

-- ── Main correspondence registry ─────────────────────────────────────────────
create table if not exists public.zafirix_correspondence (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  company_id            uuid        references public.atlas_companies (id) on delete cascade,
  direction             text        not null,
  reference_number      text        not null,
  external_reference    text,
  subject               text        not null,
  letter_type           text        not null default 'administrative',
  status                text        not null default 'registered',
  priority              text        not null default 'normal',
  confidentiality       text        not null default 'internal',
  correspondence_date   date        not null default current_date,
  received_at           timestamptz,
  sent_at               timestamptz,
  response_due_date     date,
  sender_name           text,
  sender_organization   text,
  sender_address        text,
  sender_email          text,
  sender_phone          text,
  sender_city           text,
  sender_country        text        default 'MA',
  recipient_name        text,
  recipient_organization text,
  recipient_address     text,
  recipient_email       text,
  recipient_phone       text,
  recipient_city        text,
  recipient_country     text        default 'MA',
  assigned_to           text,
  client_id             uuid        references public.atlas_clients (id) on delete set null,
  linked_correspondence_id uuid     references public.zafirix_correspondence (id) on delete set null,
  summary               text,
  notes                 text,
  metadata              jsonb       not null default '{}'::jsonb,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint zafirix_correspondence_direction_check
    check (direction in ('incoming','outgoing')),
  constraint zafirix_correspondence_letter_type_check
    check (letter_type in ('administrative','legal_notice','commercial','fiscal','judicial','hr','other')),
  constraint zafirix_correspondence_status_check
    check (status in ('registered','in_progress','replied','archived','cancelled')),
  constraint zafirix_correspondence_priority_check
    check (priority in ('low','normal','high','urgent')),
  constraint zafirix_correspondence_confidentiality_check
    check (confidentiality in ('public','internal','confidential','restricted'))
);

create unique index if not exists zafirix_correspondence_ref_idx
  on public.zafirix_correspondence (company_id, reference_number);

create index if not exists zafirix_correspondence_company_direction_idx
  on public.zafirix_correspondence (company_id, direction, correspondence_date desc);

create index if not exists zafirix_correspondence_company_status_idx
  on public.zafirix_correspondence (company_id, status, correspondence_date desc);

create index if not exists zafirix_correspondence_search_idx
  on public.zafirix_correspondence (company_id, subject, sender_name, recipient_name);

-- ── Digital file attachments ───────────────────────────────────────────────────
create table if not exists public.zafirix_correspondence_attachments (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id) on delete cascade,
  company_id         uuid        references public.atlas_companies (id) on delete cascade,
  correspondence_id  uuid        not null references public.zafirix_correspondence (id) on delete cascade,
  file_name          text        not null,
  file_url           text,
  document_type      text        not null default 'scan',
  source_document_id uuid,
  mime_type          text,
  file_size_bytes    bigint,
  uploaded_at        timestamptz not null default now(),
  constraint zafirix_correspondence_attachments_type_check
    check (document_type in ('scan','original','proof_of_delivery','acknowledgment','other'))
);

create index if not exists zafirix_correspondence_attachments_corr_idx
  on public.zafirix_correspondence_attachments (correspondence_id, uploaded_at desc);

-- ── Correspondence flow / audit events ───────────────────────────────────────
create table if not exists public.zafirix_correspondence_events (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  company_id        uuid        references public.atlas_companies (id) on delete set null,
  correspondence_id uuid        not null references public.zafirix_correspondence (id) on delete cascade,
  event_type        text        not null,
  channel           text,
  title             text        not null,
  body              text,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint zafirix_correspondence_events_type_check
    check (event_type in (
      'created','updated','status_changed','assigned','archived','attachment_added',
      'note_added','linked','response_due_alert'
    ))
);

create index if not exists zafirix_correspondence_events_corr_idx
  on public.zafirix_correspondence_events (correspondence_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_correspondence',
    'zafirix_correspondence_attachments',
    'zafirix_correspondence_events'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_correspondence_attachments' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.zafirix_correspondence c where c.id = correspondence_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.zafirix_correspondence c where c.id = correspondence_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_update_own" on public.%I for update to authenticated
         using (exists (select 1 from public.zafirix_correspondence c where c.id = correspondence_id and c.user_id = auth.uid()))
         with check (exists (select 1 from public.zafirix_correspondence c where c.id = correspondence_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_delete_own" on public.%I for delete to authenticated
         using (exists (select 1 from public.zafirix_correspondence c where c.id = correspondence_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
    elsif tbl = 'zafirix_correspondence_events' then
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
