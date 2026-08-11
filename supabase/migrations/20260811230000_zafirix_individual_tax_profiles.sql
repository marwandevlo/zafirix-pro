-- Individual taxpayer profiles: Auto-entrepreneur + Personne physique (RNR/RNS).
-- Idempotent. Moroccan compliance tracking (CA plafonds, déclarations trimestrielles, charges).

create extension if not exists "pgcrypto";

-- ── Profile settings (one row per company / fiscal year / regime family) ──────
create table if not exists public.zafirix_individual_profiles (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  company_id            uuid        not null references public.atlas_companies (id) on delete cascade,
  profile_type          text        not null,
  -- auto_entrepreneur fields
  activity_type         text        not null default 'services',
  annual_ceiling_mad    numeric(14,2) not null default 200000,
  -- personne_physique fields
  tax_regime            text        not null default 'rnr',
  fiscal_year           integer     not null default extract(year from current_date)::integer,
  display_name          text,
  ice_or_if             text,
  notes                 text,
  metadata              jsonb       not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint zafirix_individual_profiles_type_check
    check (profile_type in ('auto_entrepreneur', 'personne_physique')),
  constraint zafirix_individual_profiles_activity_check
    check (activity_type in ('services', 'commerce', 'industrie', 'artisanat')),
  constraint zafirix_individual_profiles_regime_check
    check (tax_regime in ('rnr', 'rns')),
  constraint zafirix_individual_profiles_unique
    unique (user_id, company_id, profile_type, fiscal_year)
);

create index if not exists zafirix_individual_profiles_company_idx
  on public.zafirix_individual_profiles (company_id, profile_type, fiscal_year);

-- ── Auto-entrepreneur: turnover lines (CA encaissé) ───────────────────────────
create table if not exists public.zafirix_ae_turnover_entries (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users (id) on delete cascade,
  company_id      uuid          not null references public.atlas_companies (id) on delete cascade,
  profile_id      uuid          references public.zafirix_individual_profiles (id) on delete set null,
  entry_date      date          not null default current_date,
  amount_mad      numeric(14,2) not null check (amount_mad >= 0),
  label           text          not null default '',
  client_name     text,
  invoice_ref     text,
  quarter         smallint      not null,
  fiscal_year     integer       not null,
  metadata        jsonb         not null default '{}'::jsonb,
  created_at      timestamptz   not null default now(),
  constraint zafirix_ae_turnover_quarter_check check (quarter between 1 and 4)
);

create index if not exists zafirix_ae_turnover_company_year_idx
  on public.zafirix_ae_turnover_entries (company_id, fiscal_year, quarter, entry_date desc);

create index if not exists zafirix_ae_turnover_user_idx
  on public.zafirix_ae_turnover_entries (user_id, fiscal_year);

-- ── Auto-entrepreneur: quarterly declarations ─────────────────────────────────
create table if not exists public.zafirix_ae_quarterly_declarations (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users (id) on delete cascade,
  company_id        uuid          not null references public.atlas_companies (id) on delete cascade,
  fiscal_year       integer       not null,
  quarter           smallint      not null,
  declared_ca_mad   numeric(14,2) not null default 0,
  tax_due_mad       numeric(14,2) not null default 0,
  status            text          not null default 'pending',
  due_date          date,
  declared_at       timestamptz,
  notes             text,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  constraint zafirix_ae_decl_quarter_check check (quarter between 1 and 4),
  constraint zafirix_ae_decl_status_check
    check (status in ('pending', 'declared', 'paid', 'late', 'exempt')),
  constraint zafirix_ae_decl_unique unique (user_id, company_id, fiscal_year, quarter)
);

create index if not exists zafirix_ae_decl_company_idx
  on public.zafirix_ae_quarterly_declarations (company_id, fiscal_year, quarter);

-- ── Personne physique: revenue / expense ledger ───────────────────────────────
create table if not exists public.zafirix_pp_ledger_entries (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users (id) on delete cascade,
  company_id      uuid          not null references public.atlas_companies (id) on delete cascade,
  profile_id      uuid          references public.zafirix_individual_profiles (id) on delete set null,
  entry_type      text          not null,
  entry_date      date          not null default current_date,
  amount_mad      numeric(14,2) not null check (amount_mad >= 0),
  category        text          not null default 'divers',
  label           text          not null default '',
  deductible      boolean       not null default true,
  fiscal_year     integer       not null,
  document_ref    text,
  metadata        jsonb         not null default '{}'::jsonb,
  created_at      timestamptz   not null default now(),
  constraint zafirix_pp_ledger_type_check
    check (entry_type in ('revenue', 'expense'))
);

create index if not exists zafirix_pp_ledger_company_year_idx
  on public.zafirix_pp_ledger_entries (company_id, fiscal_year, entry_type, entry_date desc);

create index if not exists zafirix_pp_ledger_user_idx
  on public.zafirix_pp_ledger_entries (user_id, fiscal_year);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_individual_profiles',
    'zafirix_ae_turnover_entries',
    'zafirix_ae_quarterly_declarations',
    'zafirix_pp_ledger_entries'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

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
    execute format(
      'create policy "%s_service_role_all" on public.%I for all to service_role using (true) with check (true)',
      tbl, tbl
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
  end loop;
end $$;

notify pgrst, 'reload schema';
