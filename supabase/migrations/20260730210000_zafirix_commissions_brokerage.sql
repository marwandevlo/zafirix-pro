-- Commissions & brokerage: agents, tiers, rules, accruals linked to invoices/payments.

create extension if not exists "pgcrypto";

-- ── Broker tiers (revenue thresholds → commission rates) ──────────────────────
create table if not exists public.zafirix_broker_tiers (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users (id) on delete cascade,
  company_id        uuid          references public.atlas_companies (id) on delete cascade,
  name              text          not null,
  code              text          not null,
  min_sales_mad     numeric(14,2) not null default 0,
  min_collected_mad numeric(14,2) not null default 0,
  commission_rate   numeric(6,3)  not null default 0,
  bonus_rate        numeric(6,3)  not null default 0,
  sort_order        integer       not null default 0,
  is_active         boolean       not null default true,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create unique index if not exists zafirix_broker_tiers_code_idx
  on public.zafirix_broker_tiers (company_id, code);

-- ── Sales agents / brokers ────────────────────────────────────────────────────
create table if not exists public.zafirix_sales_agents (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        references public.atlas_companies (id) on delete cascade,
  tier_id         uuid        references public.zafirix_broker_tiers (id) on delete set null,
  name            text        not null,
  code            text        not null,
  email           text,
  phone           text,
  agent_type      text        not null default 'sales',
  is_active       boolean     not null default true,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zafirix_sales_agents_type_check
    check (agent_type in ('sales','broker','partner'))
);

create unique index if not exists zafirix_sales_agents_code_idx
  on public.zafirix_sales_agents (company_id, code);

-- ── Commission rules (global or per-agent overrides) ──────────────────────────
create table if not exists public.zafirix_commission_rules (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users (id) on delete cascade,
  company_id      uuid          references public.atlas_companies (id) on delete cascade,
  agent_id        uuid          references public.zafirix_sales_agents (id) on delete cascade,
  name            text          not null,
  basis           text          not null default 'payment_collected',
  rate_type       text          not null default 'percent',
  rate_value      numeric(10,4) not null default 0,
  min_amount      numeric(14,2) not null default 0,
  max_commission  numeric(14,2),
  effective_from  date,
  effective_to    date,
  is_active       boolean       not null default true,
  priority        integer       not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  constraint zafirix_commission_rules_basis_check
    check (basis in ('invoice_issued','payment_collected')),
  constraint zafirix_commission_rules_rate_type_check
    check (rate_type in ('percent','fixed'))
);

create index if not exists zafirix_commission_rules_company_idx
  on public.zafirix_commission_rules (company_id, is_active, priority desc);

-- ── Invoice ↔ agent assignments ───────────────────────────────────────────────
create table if not exists public.zafirix_invoice_agent_assignments (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete cascade,
  invoice_id   uuid        not null references public.atlas_invoices (id) on delete cascade,
  agent_id     uuid        not null references public.zafirix_sales_agents (id) on delete cascade,
  split_pct    numeric(5,2) not null default 100,
  created_at   timestamptz not null default now(),
  constraint zafirix_invoice_agent_split_check check (split_pct > 0 and split_pct <= 100)
);

create unique index if not exists zafirix_invoice_agent_unique_idx
  on public.zafirix_invoice_agent_assignments (invoice_id, agent_id);

-- ── Commission accruals (linked to invoices & payments) ───────────────────────
create table if not exists public.zafirix_commission_entries (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users (id) on delete cascade,
  company_id      uuid          references public.atlas_companies (id) on delete cascade,
  agent_id        uuid          not null references public.zafirix_sales_agents (id) on delete cascade,
  rule_id         uuid          references public.zafirix_commission_rules (id) on delete set null,
  invoice_id      uuid          references public.atlas_invoices (id) on delete set null,
  payment_id      uuid          references public.atlas_payments (id) on delete set null,
  basis           text          not null,
  base_amount     numeric(14,2) not null default 0,
  rate_pct        numeric(8,4)  not null default 0,
  commission_amount numeric(14,2) not null default 0,
  tier_bonus      numeric(14,2) not null default 0,
  status          text          not null default 'pending',
  calculated_at   timestamptz   not null default now(),
  paid_at         timestamptz,
  notes           text,
  metadata        jsonb         not null default '{}'::jsonb,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  constraint zafirix_commission_entries_basis_check
    check (basis in ('invoice_issued','payment_collected')),
  constraint zafirix_commission_entries_status_check
    check (status in ('pending','approved','paid','cancelled'))
);

create index if not exists zafirix_commission_entries_agent_idx
  on public.zafirix_commission_entries (company_id, agent_id, status);

create index if not exists zafirix_commission_entries_invoice_idx
  on public.zafirix_commission_entries (invoice_id);

create unique index if not exists zafirix_commission_entries_dedupe_idx
  on public.zafirix_commission_entries (agent_id, invoice_id, payment_id, basis)
  where status != 'cancelled';

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_broker_tiers',
    'zafirix_sales_agents',
    'zafirix_commission_rules',
    'zafirix_invoice_agent_assignments',
    'zafirix_commission_entries'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_invoice_agent_assignments' then
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
