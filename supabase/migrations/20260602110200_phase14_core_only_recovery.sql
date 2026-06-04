-- Phase 14 core recovery: workspaces, roles, cabinet, company registry
-- Safe to apply when Phase 11/12 optional tables are not yet present.
-- Optional banking/liasse RLS + indexes: see 20260602110300_phase14_optional_rls_later.sql

-- ── 1. Workspaces ─────────────────────────────────────────────────────────────
create table if not exists public.atlas_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  workspace_type text not null default 'single_company'
    check (workspace_type in ('single_company', 'accounting_firm', 'enterprise_group')),
  settings_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_owner on public.atlas_workspaces (owner_user_id);

-- ── 2. Extend company registry ────────────────────────────────────────────────
alter table public.atlas_companies add column if not exists workspace_id uuid references public.atlas_workspaces (id) on delete set null;
alter table public.atlas_companies add column if not exists legal_name text;
alter table public.atlas_companies add column if not exists trade_name text;
alter table public.atlas_companies add column if not exists if_number text;
alter table public.atlas_companies add column if not exists cnss_number text;
alter table public.atlas_companies add column if not exists address text;
alter table public.atlas_companies add column if not exists city text;
alter table public.atlas_companies add column if not exists country text default 'MA';
alter table public.atlas_companies add column if not exists phone text;
alter table public.atlas_companies add column if not exists email text;
alter table public.atlas_companies add column if not exists website text;
alter table public.atlas_companies add column if not exists logo_url text;
alter table public.atlas_companies add column if not exists status text not null default 'active'
  check (status in ('active', 'inactive', 'archived'));

update public.atlas_companies
set legal_name = coalesce(nullif(trim(legal_name), ''), nullif(trim(name), '')),
    trade_name = coalesce(nullif(trim(trade_name), ''), nullif(trim(name), ''))
where legal_name is null or trade_name is null;

create index if not exists idx_companies_workspace on public.atlas_companies (workspace_id);
create index if not exists idx_companies_status on public.atlas_companies (user_id, status);

-- ── 3. Roles ──────────────────────────────────────────────────────────────────
create table if not exists public.atlas_roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.atlas_roles (slug, label) values
  ('super_admin', 'Super Admin'),
  ('owner', 'Owner'),
  ('manager', 'Manager'),
  ('accountant', 'Accountant'),
  ('payroll_manager', 'Payroll Manager'),
  ('auditor', 'Auditor'),
  ('viewer', 'Viewer')
on conflict (slug) do nothing;

-- ── 4. User roles (workspace + company scoped) ────────────────────────────────
create table if not exists public.atlas_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.atlas_workspaces (id) on delete cascade,
  company_id uuid references public.atlas_companies (id) on delete cascade,
  role_slug text not null references public.atlas_roles (slug) on delete restrict,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id, company_id, role_slug)
);

create index if not exists idx_user_roles_user on public.atlas_user_roles (user_id);
create index if not exists idx_user_roles_workspace on public.atlas_user_roles (workspace_id);
create index if not exists idx_user_roles_company on public.atlas_user_roles (company_id);

-- ── 5. Cabinet clients (firm → managed companies) ───────────────────────────
create table if not exists public.atlas_cabinet_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces (id) on delete cascade,
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  client_label text,
  contact_name text,
  contact_email text,
  contact_phone text,
  health_score int not null default 0 check (health_score >= 0 and health_score <= 100),
  readiness_score int not null default 0 check (readiness_score >= 0 and readiness_score <= 100),
  health_band text not null default 'attention' check (health_band in ('healthy', 'attention', 'critical')),
  alert_count int not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, company_id)
);

create index if not exists idx_cabinet_clients_workspace on public.atlas_cabinet_clients (workspace_id);
create index if not exists idx_cabinet_clients_company on public.atlas_cabinet_clients (company_id);

-- ── 6. RLS: workspaces ────────────────────────────────────────────────────────
alter table public.atlas_workspaces enable row level security;

drop policy if exists "atlas_workspaces_owner" on public.atlas_workspaces;
create policy "atlas_workspaces_owner" on public.atlas_workspaces
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists "atlas_workspaces_member" on public.atlas_workspaces;
create policy "atlas_workspaces_member" on public.atlas_workspaces
  for select using (
    exists (
      select 1 from public.atlas_user_roles ur
      where ur.workspace_id = atlas_workspaces.id and ur.user_id = auth.uid()
    )
  );

-- ── 7. RLS: user roles ────────────────────────────────────────────────────────
alter table public.atlas_user_roles enable row level security;

drop policy if exists "atlas_user_roles_own" on public.atlas_user_roles;
create policy "atlas_user_roles_own" on public.atlas_user_roles
  for select using (auth.uid() = user_id);

drop policy if exists "atlas_user_roles_workspace_owner" on public.atlas_user_roles;
create policy "atlas_user_roles_workspace_owner" on public.atlas_user_roles
  for all using (
    exists (
      select 1 from public.atlas_workspaces w
      where w.id = atlas_user_roles.workspace_id and w.owner_user_id = auth.uid()
    )
  );

-- ── 8. RLS: cabinet clients ───────────────────────────────────────────────────
alter table public.atlas_cabinet_clients enable row level security;

drop policy if exists "atlas_cabinet_clients_workspace" on public.atlas_cabinet_clients;
create policy "atlas_cabinet_clients_workspace" on public.atlas_cabinet_clients
  for all using (
    exists (
      select 1 from public.atlas_workspaces w
      where w.id = atlas_cabinet_clients.workspace_id
        and (w.owner_user_id = auth.uid() or exists (
          select 1 from public.atlas_user_roles ur
          where ur.workspace_id = w.id and ur.user_id = auth.uid()
        ))
    )
  );

-- ── 9. RLS: roles reference (read all authenticated) ─────────────────────────
alter table public.atlas_roles enable row level security;

drop policy if exists "atlas_roles_read" on public.atlas_roles;
create policy "atlas_roles_read" on public.atlas_roles
  for select using (auth.uid() is not null);

-- ── 10. Performance indexes (guarded — core tables only) ──────────────────────
DO $$
BEGIN
  IF to_regclass('public.atlas_invoices') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.atlas_invoices (company_id) WHERE company_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.atlas_accounting_entries') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_accounting_company ON public.atlas_accounting_entries (company_id) WHERE company_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.zafirix_tva_suggestions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tva_suggestions_company ON public.zafirix_tva_suggestions (company_id)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.atlas_ai_anomalies') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_anomalies_company ON public.atlas_ai_anomalies (company_id) WHERE company_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.atlas_ai_context') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_context_company ON public.atlas_ai_context (company_id) WHERE company_id IS NOT NULL';
  END IF;
END $$;
