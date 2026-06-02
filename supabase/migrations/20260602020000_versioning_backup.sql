-- Versioning, Google Drive credentials, and backup tracking.
-- All tables are idempotent (create if not exists / add column if not exists).

-- ── zafirix_google_credentials ───────────────────────────────────────────────
-- One row per user. Stores OAuth2 tokens for Google Drive.

create table if not exists public.zafirix_google_credentials (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null unique references auth.users (id) on delete cascade,
  company_id      uuid        references public.atlas_companies (id) on delete set null,
  access_token    text        not null,
  refresh_token   text,
  token_type      text        not null default 'Bearer',
  expires_at      timestamptz,
  scope           text,
  google_email    text,
  connected_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.zafirix_google_credentials enable row level security;

drop policy if exists "gdrive_creds_select_own" on public.zafirix_google_credentials;
create policy "gdrive_creds_select_own"
  on public.zafirix_google_credentials for select
  using (auth.uid() = user_id);

drop policy if exists "gdrive_creds_insert_own" on public.zafirix_google_credentials;
create policy "gdrive_creds_insert_own"
  on public.zafirix_google_credentials for insert
  with check (auth.uid() = user_id);

drop policy if exists "gdrive_creds_update_own" on public.zafirix_google_credentials;
create policy "gdrive_creds_update_own"
  on public.zafirix_google_credentials for update
  using (auth.uid() = user_id);

drop policy if exists "gdrive_creds_delete_own" on public.zafirix_google_credentials;
create policy "gdrive_creds_delete_own"
  on public.zafirix_google_credentials for delete
  using (auth.uid() = user_id);

-- Service role access for server-side token refresh
drop policy if exists "gdrive_creds_service_all" on public.zafirix_google_credentials;
create policy "gdrive_creds_service_all"
  on public.zafirix_google_credentials for all
  using (true);

-- ── zafirix_file_versions ─────────────────────────────────────────────────────
-- Tracks every export as a versioned snapshot.

create table if not exists public.zafirix_file_versions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        references public.atlas_companies (id) on delete set null,
  entity_type     text        not null,
  entity_id       text        not null,
  version_number  integer     not null default 1,
  file_format     text        not null,
  filename        text        not null,
  file_size_bytes integer,
  storage_path    text,
  google_drive_file_id text,
  google_drive_url     text,
  created_at      timestamptz not null default now(),
  constraint zafirix_file_versions_format_check
    check (file_format in ('json','csv','xml','xlsx','pdf','zip','edi'))
);

create index if not exists zafirix_file_versions_entity_idx
  on public.zafirix_file_versions (entity_type, entity_id, created_at desc);
create index if not exists zafirix_file_versions_user_idx
  on public.zafirix_file_versions (user_id, created_at desc);

alter table public.zafirix_file_versions enable row level security;

drop policy if exists "file_versions_select_own" on public.zafirix_file_versions;
create policy "file_versions_select_own"
  on public.zafirix_file_versions for select
  using (auth.uid() = user_id);

drop policy if exists "file_versions_service_all" on public.zafirix_file_versions;
create policy "file_versions_service_all"
  on public.zafirix_file_versions for all
  using (true);

-- ── zafirix_backups ───────────────────────────────────────────────────────────
-- Backup log: every backup action, regardless of destination.

create table if not exists public.zafirix_backups (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  company_id          uuid        references public.atlas_companies (id) on delete set null,
  entity_type         text        not null,
  entity_id           text        not null,
  provider            text        not null default 'local',
  file_format         text        not null,
  filename            text        not null,
  file_size_bytes     integer,
  provider_file_id    text,
  provider_folder_id  text,
  provider_url        text,
  sync_status         text        not null default 'pending',
  error_message       text,
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  constraint zafirix_backups_provider_check
    check (provider in ('local','google_drive','onedrive','dropbox')),
  constraint zafirix_backups_status_check
    check (sync_status in ('pending','completed','failed','syncing'))
);

create index if not exists zafirix_backups_entity_idx
  on public.zafirix_backups (entity_type, entity_id, created_at desc);
create index if not exists zafirix_backups_user_idx
  on public.zafirix_backups (user_id, created_at desc);
create index if not exists zafirix_backups_provider_idx
  on public.zafirix_backups (provider, sync_status, created_at desc);

alter table public.zafirix_backups enable row level security;

drop policy if exists "backups_select_own" on public.zafirix_backups;
create policy "backups_select_own"
  on public.zafirix_backups for select
  using (auth.uid() = user_id);

drop policy if exists "backups_service_all" on public.zafirix_backups;
create policy "backups_service_all"
  on public.zafirix_backups for all
  using (true);
