-- RH / Payroll / IR / IS — real persistence.

create extension if not exists "pgcrypto";

-- Extend employees with payroll fields
alter table public.atlas_employees add column if not exists cin text;
alter table public.atlas_employees add column if not exists cnss_matricule text;
alter table public.atlas_employees add column if not exists gross_salary_mad numeric(14, 2);
alter table public.atlas_employees add column if not exists hire_date date;

create table if not exists public.atlas_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  status text not null default 'draft',
  total_gross numeric(14, 2) not null default 0,
  total_cnss_employee numeric(14, 2) not null default 0,
  total_amo_employee numeric(14, 2) not null default 0,
  total_ir numeric(14, 2) not null default 0,
  total_net numeric(14, 2) not null default 0,
  formula_version text not null default 'ma-2026-v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_payroll_runs_status_check check (status in ('draft', 'validated')),
  constraint atlas_payroll_runs_company_period_unique unique (company_id, period_year, period_month)
);

create index if not exists atlas_payroll_runs_user_idx on public.atlas_payroll_runs (user_id);
create index if not exists atlas_payroll_runs_company_idx on public.atlas_payroll_runs (company_id, period_year desc, period_month desc);

create table if not exists public.atlas_salaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  payroll_run_id uuid not null references public.atlas_payroll_runs (id) on delete cascade,
  employee_id uuid not null references public.atlas_employees (id) on delete cascade,
  gross_salary numeric(14, 2) not null default 0,
  cnss_employee numeric(14, 2) not null default 0,
  amo_employee numeric(14, 2) not null default 0,
  ir_amount numeric(14, 2) not null default 0,
  net_salary numeric(14, 2) not null default 0,
  cnss_employer numeric(14, 2) not null default 0,
  amo_employer numeric(14, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_salaries_run_employee_unique unique (payroll_run_id, employee_id)
);

create index if not exists atlas_salaries_run_idx on public.atlas_salaries (payroll_run_id);
create index if not exists atlas_salaries_company_idx on public.atlas_salaries (company_id);

create table if not exists public.atlas_ir_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  payroll_run_id uuid references public.atlas_payroll_runs (id) on delete set null,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  total_ir numeric(14, 2) not null default 0,
  total_gross numeric(14, 2) not null default 0,
  employee_count integer not null default 0,
  formula_version text not null default 'ma-ir-2026-v1',
  snapshot_json jsonb not null default '{}'::jsonb,
  disclaimer text not null default 'à valider par expert-comptable',
  created_at timestamptz not null default now(),
  constraint atlas_ir_snapshots_company_period_unique unique (company_id, period_year, period_month)
);

create index if not exists atlas_ir_snapshots_company_idx on public.atlas_ir_snapshots (company_id, period_year desc, period_month desc);

create table if not exists public.atlas_is_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  fiscal_year integer not null,
  period_start date not null,
  period_end date not null,
  revenue_ht numeric(14, 2) not null default 0,
  supplier_expenses_ht numeric(14, 2) not null default 0,
  payroll_total numeric(14, 2) not null default 0,
  accounting_charges numeric(14, 2) not null default 0,
  taxable_result numeric(14, 2) not null default 0,
  estimated_is numeric(14, 2) not null default 0,
  minimal_contribution numeric(14, 2) not null default 0,
  is_due numeric(14, 2) not null default 0,
  status text not null default 'draft',
  formula_version text not null default 'ma-is-2026-v1',
  sources_json jsonb not null default '{}'::jsonb,
  disclaimer text not null default 'à valider par expert-comptable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_is_drafts_status_check check (status in ('draft', 'validated')),
  constraint atlas_is_drafts_company_year_unique unique (company_id, fiscal_year)
);

create index if not exists atlas_is_drafts_company_idx on public.atlas_is_drafts (company_id, fiscal_year desc);

-- RLS
alter table public.atlas_payroll_runs enable row level security;
alter table public.atlas_salaries enable row level security;
alter table public.atlas_ir_snapshots enable row level security;
alter table public.atlas_is_drafts enable row level security;

drop policy if exists "atlas_payroll_runs_select_own" on public.atlas_payroll_runs;
create policy "atlas_payroll_runs_select_own" on public.atlas_payroll_runs for select using (auth.uid() = user_id);
drop policy if exists "atlas_payroll_runs_insert_own" on public.atlas_payroll_runs;
create policy "atlas_payroll_runs_insert_own" on public.atlas_payroll_runs for insert with check (auth.uid() = user_id);
drop policy if exists "atlas_payroll_runs_update_own" on public.atlas_payroll_runs;
create policy "atlas_payroll_runs_update_own" on public.atlas_payroll_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "atlas_payroll_runs_delete_own" on public.atlas_payroll_runs;
create policy "atlas_payroll_runs_delete_own" on public.atlas_payroll_runs for delete using (auth.uid() = user_id);

drop policy if exists "atlas_salaries_select_own" on public.atlas_salaries;
create policy "atlas_salaries_select_own" on public.atlas_salaries for select using (auth.uid() = user_id);
drop policy if exists "atlas_salaries_insert_own" on public.atlas_salaries;
create policy "atlas_salaries_insert_own" on public.atlas_salaries for insert with check (auth.uid() = user_id);
drop policy if exists "atlas_salaries_update_own" on public.atlas_salaries;
create policy "atlas_salaries_update_own" on public.atlas_salaries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "atlas_salaries_delete_own" on public.atlas_salaries;
create policy "atlas_salaries_delete_own" on public.atlas_salaries for delete using (auth.uid() = user_id);

drop policy if exists "atlas_ir_snapshots_select_own" on public.atlas_ir_snapshots;
create policy "atlas_ir_snapshots_select_own" on public.atlas_ir_snapshots for select using (auth.uid() = user_id);
drop policy if exists "atlas_ir_snapshots_insert_own" on public.atlas_ir_snapshots;
create policy "atlas_ir_snapshots_insert_own" on public.atlas_ir_snapshots for insert with check (auth.uid() = user_id);
drop policy if exists "atlas_ir_snapshots_update_own" on public.atlas_ir_snapshots;
create policy "atlas_ir_snapshots_update_own" on public.atlas_ir_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "atlas_ir_snapshots_delete_own" on public.atlas_ir_snapshots;
create policy "atlas_ir_snapshots_delete_own" on public.atlas_ir_snapshots for delete using (auth.uid() = user_id);

drop policy if exists "atlas_is_drafts_select_own" on public.atlas_is_drafts;
create policy "atlas_is_drafts_select_own" on public.atlas_is_drafts for select using (auth.uid() = user_id);
drop policy if exists "atlas_is_drafts_insert_own" on public.atlas_is_drafts;
create policy "atlas_is_drafts_insert_own" on public.atlas_is_drafts for insert with check (auth.uid() = user_id);
drop policy if exists "atlas_is_drafts_update_own" on public.atlas_is_drafts;
create policy "atlas_is_drafts_update_own" on public.atlas_is_drafts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "atlas_is_drafts_delete_own" on public.atlas_is_drafts;
create policy "atlas_is_drafts_delete_own" on public.atlas_is_drafts for delete using (auth.uid() = user_id);
