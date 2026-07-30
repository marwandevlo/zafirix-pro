-- Smart contract management: contracts, parties, attachments, renewal tracking.

create extension if not exists "pgcrypto";

-- ── Contracts registry ────────────────────────────────────────────────────────
create table if not exists public.zafirix_contracts (
  id                   uuid          primary key default gen_random_uuid(),
  user_id              uuid          not null references auth.users (id) on delete cascade,
  company_id           uuid          references public.atlas_companies (id) on delete cascade,
  reference            text,
  title                text          not null,
  contract_type        text          not null default 'commercial',
  status               text          not null default 'active',
  effective_date       date,
  expiry_date          date,
  renewal_date         date,
  renewal_terms        text,
  auto_renew           boolean       not null default false,
  renewal_notice_days  integer       not null default 30,
  alert_days           integer[]     not null default '{42,28,21,14,7,3,1}',
  contract_value       numeric(14,2),
  currency             text          not null default 'MAD',
  notes                text,
  legal_document_id    uuid          references public.zafirix_legal_documents (id) on delete set null,
  terminated_at        timestamptz,
  termination_reason   text,
  metadata             jsonb         not null default '{}'::jsonb,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),
  constraint zafirix_contracts_type_check
    check (contract_type in ('commercial','lease','service','employment','nda','partnership','other')),
  constraint zafirix_contracts_status_check
    check (status in ('draft','active','expiring','terminated','renewed'))
);

create index if not exists zafirix_contracts_company_status_idx
  on public.zafirix_contracts (company_id, status, expiry_date);

create index if not exists zafirix_contracts_expiry_idx
  on public.zafirix_contracts (company_id, expiry_date)
  where expiry_date is not null and status not in ('terminated','renewed');

create index if not exists zafirix_contracts_renewal_idx
  on public.zafirix_contracts (company_id, renewal_date)
  where renewal_date is not null and status not in ('terminated','renewed');

-- ── Contract parties ──────────────────────────────────────────────────────────
create table if not exists public.zafirix_contract_parties (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  company_id     uuid        references public.atlas_companies (id) on delete cascade,
  contract_id    uuid        not null references public.zafirix_contracts (id) on delete cascade,
  party_name     text        not null,
  party_role     text        not null default 'other',
  contact_email  text,
  contact_phone  text,
  client_id      uuid        references public.atlas_clients (id) on delete set null,
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default now(),
  constraint zafirix_contract_parties_role_check
    check (party_role in ('client','supplier','partner','landlord','employee','other'))
);

create index if not exists zafirix_contract_parties_contract_idx
  on public.zafirix_contract_parties (contract_id, sort_order);

-- ── Contract attachments ──────────────────────────────────────────────────────
create table if not exists public.zafirix_contract_attachments (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id) on delete cascade,
  company_id         uuid        references public.atlas_companies (id) on delete cascade,
  contract_id        uuid        not null references public.zafirix_contracts (id) on delete cascade,
  file_name          text        not null,
  file_url           text,
  document_type      text        not null default 'contract',
  source_document_id uuid,
  mime_type          text,
  file_size_bytes    bigint,
  uploaded_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint zafirix_contract_attachments_type_check
    check (document_type in ('contract','amendment','annex','notice','other'))
);

create index if not exists zafirix_contract_attachments_contract_idx
  on public.zafirix_contract_attachments (contract_id, uploaded_at desc);

-- ── Contract alert events ─────────────────────────────────────────────────────
create table if not exists public.zafirix_contract_events (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  contract_id  uuid        not null references public.zafirix_contracts (id) on delete cascade,
  event_type   text        not null,
  channel      text,
  title        text        not null,
  body         text,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint zafirix_contract_events_type_check
    check (event_type in (
      'reminder_sent','renewal_alert','expiry_alert','terminated','renewed',
      'created','updated','alert_email','alert_whatsapp','alert_in_app'
    ))
);

create index if not exists zafirix_contract_events_contract_idx
  on public.zafirix_contract_events (contract_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_contracts',
    'zafirix_contract_parties',
    'zafirix_contract_attachments',
    'zafirix_contract_events'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_contract_parties' or tbl = 'zafirix_contract_attachments' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.zafirix_contracts c where c.id = contract_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.zafirix_contracts c where c.id = contract_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_update_own" on public.%I for update to authenticated
         using (exists (select 1 from public.zafirix_contracts c where c.id = contract_id and c.user_id = auth.uid()))
         with check (exists (select 1 from public.zafirix_contracts c where c.id = contract_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_delete_own" on public.%I for delete to authenticated
         using (exists (select 1 from public.zafirix_contracts c where c.id = contract_id and c.user_id = auth.uid()))',
        tbl, tbl
      );
    elsif tbl = 'zafirix_contract_events' then
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
