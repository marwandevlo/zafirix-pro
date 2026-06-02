-- Phase 11: Banking Automation & Payroll Engine

-- ── Bank statements ──────────────────────────────────────────────────────────
create table if not exists public.zafirix_bank_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  source_document_id uuid,
  bank_name text,
  account_number text,
  statement_period_start date,
  statement_period_end date,
  opening_balance numeric(18,2),
  closing_balance numeric(18,2),
  currency text default 'MAD',
  transaction_count int default 0,
  validation_status text not null default 'draft'
    check (validation_status in ('draft','reviewed','validated','rejected')),
  raw_extraction jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Bank transactions ────────────────────────────────────────────────────────
create table if not exists public.zafirix_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  statement_id uuid references public.zafirix_bank_statements(id) on delete cascade,
  source_document_id uuid,
  account_number text,
  transaction_date date,
  value_date date,
  description text,
  reference text,
  debit numeric(18,2) default 0,
  credit numeric(18,2) default 0,
  amount numeric(18,2) not null default 0,
  balance numeric(18,2),
  currency text default 'MAD',
  validation_status text not null default 'draft'
    check (validation_status in ('draft','reviewed','validated','rejected')),
  confidence_score numeric(5,4),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_tx_date on public.zafirix_bank_transactions(transaction_date);
create index if not exists idx_bank_tx_source_doc on public.zafirix_bank_transactions(source_document_id);
create index if not exists idx_bank_tx_account on public.zafirix_bank_transactions(account_number);
create index if not exists idx_bank_tx_statement on public.zafirix_bank_transactions(statement_id);
create index if not exists idx_bank_tx_user on public.zafirix_bank_transactions(user_id, transaction_date desc);

-- ── Bank reconciliation ────────────────────────────────────────────────────────
create table if not exists public.atlas_bank_reconciliation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  transaction_id uuid not null references public.zafirix_bank_transactions(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  confidence numeric(5,2) not null default 0,
  status text not null default 'suggested'
    check (status in ('matched','suggested','unmatched','rejected')),
  match_reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, entity_type, entity_id)
);

create index if not exists idx_bank_recon_tx on public.atlas_bank_reconciliation(transaction_id);
create index if not exists idx_bank_recon_status on public.atlas_bank_reconciliation(user_id, status);

-- ── Payslip extractions ──────────────────────────────────────────────────────
create table if not exists public.atlas_payslip_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  source_document_id uuid,
  employee_id uuid references public.atlas_employees(id) on delete set null,
  employee_name text,
  matricule text,
  cin text,
  cnss_number text,
  period_year int,
  period_month int,
  gross_salary numeric(18,2),
  net_salary numeric(18,2),
  bonuses numeric(18,2) default 0,
  deductions numeric(18,2) default 0,
  cnss_amount numeric(18,2),
  ir_amount numeric(18,2),
  match_confidence numeric(5,2) default 0,
  validation_status text not null default 'draft'
    check (validation_status in ('draft','reviewed','validated','rejected')),
  payroll_run_id uuid references public.atlas_payroll_runs(id) on delete set null,
  salary_id uuid references public.atlas_salaries(id) on delete set null,
  raw_extraction jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payslip_ext_doc on public.atlas_payslip_extractions(source_document_id);
create index if not exists idx_payslip_ext_employee on public.atlas_payslip_extractions(employee_id);
create index if not exists idx_payslip_ext_user on public.atlas_payslip_extractions(user_id, validation_status);

-- RLS (service role used by APIs; enable for consistency)
alter table public.zafirix_bank_statements enable row level security;
alter table public.zafirix_bank_transactions enable row level security;
alter table public.atlas_bank_reconciliation enable row level security;
alter table public.atlas_payslip_extractions enable row level security;
