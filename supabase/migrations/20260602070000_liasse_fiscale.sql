-- Phase 12: Liasse Fiscale — fiscal closing package integrated with Phase 11 data

create table if not exists public.zafirix_liasse_fiscale (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  fiscal_year int not null,
  status text not null default 'draft'
    check (status in ('draft','validated','filed')),
  readiness_score numeric(5,2) default 0,
  payload jsonb not null default '{}',
  validation_result jsonb not null default '{}',
  blocking_issues jsonb not null default '[]',
  admin_override_reason text,
  generated_at timestamptz,
  validated_at timestamptz,
  filed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, fiscal_year)
);

create index if not exists idx_liasse_fiscale_user_year
  on public.zafirix_liasse_fiscale(user_id, fiscal_year desc);

alter table public.zafirix_liasse_fiscale enable row level security;
