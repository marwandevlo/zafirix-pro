-- Documents IA production layer:
-- zafirix_share_links, zafirix_exports, zafirix_file_versions (idempotent).

create extension if not exists "pgcrypto";

-- ── zafirix_share_links ───────────────────────────────────────────────────────
-- Secure, time-limited, revocable share links for any entity.

create table if not exists public.zafirix_share_links (
  id              uuid        primary key default gen_random_uuid(),
  company_id      uuid        not null references public.atlas_companies (id) on delete cascade,
  created_by      uuid        not null references auth.users (id) on delete cascade,
  entity_type     text        not null,
  entity_id       text        not null,
  token           text        not null unique,
  permissions     text        not null default 'read_only',
  expires_at      timestamptz,
  revoked_at      timestamptz,
  accessed_count  integer     not null default 0,
  last_accessed_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint zafirix_share_links_permissions_check
    check (permissions in ('read_only', 'download', 'comment'))
);

create index if not exists zafirix_share_links_token_idx
  on public.zafirix_share_links (token)
  where revoked_at is null;
create index if not exists zafirix_share_links_entity_idx
  on public.zafirix_share_links (entity_type, entity_id, created_at desc);
create index if not exists zafirix_share_links_company_idx
  on public.zafirix_share_links (company_id, created_at desc);

alter table public.zafirix_share_links enable row level security;

drop policy if exists "zafirix_share_links_select_own" on public.zafirix_share_links;
create policy "zafirix_share_links_select_own"
  on public.zafirix_share_links for select
  using (auth.uid() = created_by);

drop policy if exists "zafirix_share_links_insert_own" on public.zafirix_share_links;
create policy "zafirix_share_links_insert_own"
  on public.zafirix_share_links for insert
  with check (auth.uid() = created_by);

drop policy if exists "zafirix_share_links_update_own" on public.zafirix_share_links;
create policy "zafirix_share_links_update_own"
  on public.zafirix_share_links for update
  using (auth.uid() = created_by);

-- Service role can read tokens for public share page
drop policy if exists "zafirix_share_links_service_select" on public.zafirix_share_links;
create policy "zafirix_share_links_service_select"
  on public.zafirix_share_links for select
  using (true);

drop policy if exists "zafirix_share_links_service_update" on public.zafirix_share_links;
create policy "zafirix_share_links_service_update"
  on public.zafirix_share_links for update
  using (true);

-- ── zafirix_exports ───────────────────────────────────────────────────────────
-- Track every export for audit and re-download.

create table if not exists public.zafirix_exports (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid,
  entity_type     text        not null,
  entity_id       text        not null,
  format          text        not null,
  filename        text        not null,
  file_size_bytes integer,
  storage_path    text,
  created_at      timestamptz not null default now(),
  constraint zafirix_exports_format_check
    check (format in ('json','csv','xml','xlsx','pdf','zip','edi'))
);

create index if not exists zafirix_exports_entity_idx
  on public.zafirix_exports (entity_type, entity_id, created_at desc);
create index if not exists zafirix_exports_user_idx
  on public.zafirix_exports (user_id, created_at desc);

alter table public.zafirix_exports enable row level security;

drop policy if exists "zafirix_exports_select_own" on public.zafirix_exports;
create policy "zafirix_exports_select_own"
  on public.zafirix_exports for select
  using (auth.uid() = user_id);

drop policy if exists "zafirix_exports_insert_own" on public.zafirix_exports;
create policy "zafirix_exports_insert_own"
  on public.zafirix_exports for insert
  with check (auth.uid() = user_id);

drop policy if exists "zafirix_exports_service_insert" on public.zafirix_exports;
create policy "zafirix_exports_service_insert"
  on public.zafirix_exports for insert
  with check (true);
