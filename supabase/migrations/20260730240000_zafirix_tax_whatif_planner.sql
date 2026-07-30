-- AI Tax What-If Planner: saved fiscal simulation scenarios.

create extension if not exists "pgcrypto";

create table if not exists public.zafirix_tax_whatif_scenarios (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  company_id        uuid        references public.atlas_companies (id) on delete cascade,
  name              text        not null,
  fiscal_year       integer     not null,
  baseline_json     jsonb       not null default '{}'::jsonb,
  adjustments_json  jsonb       not null default '{}'::jsonb,
  results_json      jsonb       not null default '{}'::jsonb,
  ai_projection     text,
  ai_provider       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists zafirix_tax_whatif_scenarios_company_idx
  on public.zafirix_tax_whatif_scenarios (company_id, fiscal_year desc, updated_at desc);

alter table public.zafirix_tax_whatif_scenarios enable row level security;

drop policy if exists "zafirix_tax_whatif_scenarios_select_own" on public.zafirix_tax_whatif_scenarios;
create policy "zafirix_tax_whatif_scenarios_select_own"
  on public.zafirix_tax_whatif_scenarios for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "zafirix_tax_whatif_scenarios_insert_own" on public.zafirix_tax_whatif_scenarios;
create policy "zafirix_tax_whatif_scenarios_insert_own"
  on public.zafirix_tax_whatif_scenarios for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "zafirix_tax_whatif_scenarios_update_own" on public.zafirix_tax_whatif_scenarios;
create policy "zafirix_tax_whatif_scenarios_update_own"
  on public.zafirix_tax_whatif_scenarios for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "zafirix_tax_whatif_scenarios_delete_own" on public.zafirix_tax_whatif_scenarios;
create policy "zafirix_tax_whatif_scenarios_delete_own"
  on public.zafirix_tax_whatif_scenarios for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "zafirix_tax_whatif_scenarios_service_role_all" on public.zafirix_tax_whatif_scenarios;
create policy "zafirix_tax_whatif_scenarios_service_role_all"
  on public.zafirix_tax_whatif_scenarios for all to service_role
  using (true) with check (true);

grant select, insert, update, delete on public.zafirix_tax_whatif_scenarios to authenticated;
grant all on public.zafirix_tax_whatif_scenarios to service_role;

notify pgrst, 'reload schema';
