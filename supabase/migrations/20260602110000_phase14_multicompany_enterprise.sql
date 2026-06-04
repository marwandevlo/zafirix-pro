-- Phase 14: Multi-company, cabinet mode & enterprise foundations

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

-- Backfill legal/trade from existing name
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

-- ── 6. Company switch audit events ────────────────────────────────────────────
-- Uses atlas_audit_logs with entity_type 'company_switch' / 'role_assignment'

-- ── 7. RLS: workspaces ────────────────────────────────────────────────────────
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

-- ── 8. RLS: user roles ────────────────────────────────────────────────────────
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

-- ── 9. RLS: cabinet clients ───────────────────────────────────────────────────
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

-- ── 10. RLS: roles reference (read all authenticated) ─────────────────────────
alter table public.atlas_roles enable row level security;

drop policy if exists "atlas_roles_read" on public.atlas_roles;
create policy "atlas_roles_read" on public.atlas_roles
  for select using (auth.uid() is not null);

-- ── 11. Phase 11 banking RLS (gap fix — optional tables) ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'zafirix_bank_statements' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.zafirix_bank_statements ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "bank_statements_own" ON public.zafirix_bank_statements;
    CREATE POLICY "bank_statements_own" ON public.zafirix_bank_statements
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'zafirix_bank_transactions' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.zafirix_bank_transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "bank_transactions_own" ON public.zafirix_bank_transactions;
    CREATE POLICY "bank_transactions_own" ON public.zafirix_bank_transactions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'atlas_bank_reconciliation' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.atlas_bank_reconciliation ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "bank_reconciliation_own" ON public.atlas_bank_reconciliation;
    CREATE POLICY "bank_reconciliation_own" ON public.atlas_bank_reconciliation
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'atlas_payslip_extractions' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.atlas_payslip_extractions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "payslip_extractions_own" ON public.atlas_payslip_extractions;
    CREATE POLICY "payslip_extractions_own" ON public.atlas_payslip_extractions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 12. Liasse RLS (gap fix — optional table) ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'zafirix_liasse_fiscale' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.zafirix_liasse_fiscale ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "liasse_fiscale_own" ON public.zafirix_liasse_fiscale;
    CREATE POLICY "liasse_fiscale_own" ON public.zafirix_liasse_fiscale
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 13. Performance indexes (company_id + workspace) ──────────────────────────
create index if not exists idx_invoices_company on public.atlas_invoices (company_id) where company_id is not null;
create index if not exists idx_accounting_company on public.atlas_accounting_entries (company_id) where company_id is not null;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'zafirix_bank_transactions' AND c.relkind = 'r'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_bank_tx_company ON public.zafirix_bank_transactions (company_id) WHERE company_id IS NOT NULL;
  END IF;
END $$;

create index if not exists idx_tva_suggestions_company on public.zafirix_tva_suggestions (company_id);
create index if not exists idx_ai_anomalies_company on public.atlas_ai_anomalies (company_id) where company_id is not null;
create index if not exists idx_ai_context_company on public.atlas_ai_context (company_id) where company_id is not null;
