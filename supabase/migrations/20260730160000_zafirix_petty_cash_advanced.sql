-- Petty cash (Caisse de régie): funds, expense vouchers, attachments, approval workflow.
-- Extends zafirix_petty_cash_entries.

create extension if not exists "pgcrypto";

-- ── Petty cash funds (floats) ─────────────────────────────────────────────────
create table if not exists public.zafirix_petty_cash_funds (
  id                 uuid          primary key default gen_random_uuid(),
  user_id            uuid          not null references auth.users (id) on delete cascade,
  company_id         uuid          references public.atlas_companies (id) on delete set null,
  name               text          not null,
  code               text          not null default '',
  float_amount       numeric(14,2) not null default 0,
  accounting_account text          not null default '516100',
  custodian_name     text,
  is_active          boolean       not null default true,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

create index if not exists zafirix_petty_cash_funds_company_idx
  on public.zafirix_petty_cash_funds (company_id, created_at desc);

-- ── Expense vouchers (pièces de caisse) ─────────────────────────────────────
create table if not exists public.zafirix_petty_cash_vouchers (
  id                 uuid          primary key default gen_random_uuid(),
  user_id            uuid          not null references auth.users (id) on delete cascade,
  company_id         uuid          references public.atlas_companies (id) on delete set null,
  fund_id            uuid          not null references public.zafirix_petty_cash_funds (id) on delete restrict,
  voucher_number     text          not null,
  voucher_date       date          not null default current_date,
  amount             numeric(14,2) not null,
  beneficiary        text,
  purpose            text,
  expense_category   text          not null default 'charges_diverses',
  expense_account    text          not null default '618000',
  status             text          not null default 'draft',
  entry_id           uuid          references public.zafirix_petty_cash_entries (id) on delete set null,
  reconciled_at      timestamptz,
  accounting_posted  boolean       not null default false,
  metadata           jsonb         not null default '{}'::jsonb,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now(),
  constraint zafirix_petty_cash_vouchers_status_check
    check (status in ('draft','pending','approved','rejected','posted','reconciled')),
  constraint zafirix_petty_cash_vouchers_amount_positive check (amount > 0)
);

create unique index if not exists zafirix_petty_cash_vouchers_number_idx
  on public.zafirix_petty_cash_vouchers (fund_id, voucher_number);

create index if not exists zafirix_petty_cash_vouchers_company_idx
  on public.zafirix_petty_cash_vouchers (company_id, status, voucher_date desc);

-- ── Receipt attachments ───────────────────────────────────────────────────────
create table if not exists public.zafirix_petty_cash_attachments (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  voucher_id   uuid        not null references public.zafirix_petty_cash_vouchers (id) on delete cascade,
  file_name    text        not null,
  file_url     text        not null,
  mime_type    text,
  file_size    integer,
  created_at   timestamptz not null default now()
);

create index if not exists zafirix_petty_cash_attachments_voucher_idx
  on public.zafirix_petty_cash_attachments (voucher_id);

-- ── Approval workflow steps ───────────────────────────────────────────────────
create table if not exists public.zafirix_petty_cash_approvals (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  voucher_id   uuid        not null references public.zafirix_petty_cash_vouchers (id) on delete cascade,
  step         text        not null,
  actor_name   text,
  actor_role   text,
  comment      text,
  created_at   timestamptz not null default now(),
  constraint zafirix_petty_cash_approvals_step_check
    check (step in ('submitted','manager_review','finance_review','approved','rejected'))
);

create index if not exists zafirix_petty_cash_approvals_voucher_idx
  on public.zafirix_petty_cash_approvals (voucher_id, created_at);

-- ── Extend ledger entries ─────────────────────────────────────────────────────
alter table public.zafirix_petty_cash_entries
  add column if not exists fund_id uuid references public.zafirix_petty_cash_funds (id) on delete set null,
  add column if not exists voucher_id uuid references public.zafirix_petty_cash_vouchers (id) on delete set null,
  add column if not exists accounting_account text,
  add column if not exists reconciled_at timestamptz,
  add column if not exists accounting_entry_ids jsonb not null default '[]'::jsonb;

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_petty_cash_funds',
    'zafirix_petty_cash_vouchers',
    'zafirix_petty_cash_attachments',
    'zafirix_petty_cash_approvals'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl in ('zafirix_petty_cash_attachments', 'zafirix_petty_cash_approvals') then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.zafirix_petty_cash_vouchers v where v.id = voucher_id and v.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.zafirix_petty_cash_vouchers v where v.id = voucher_id and v.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_update_own" on public.%I for update to authenticated
         using (exists (select 1 from public.zafirix_petty_cash_vouchers v where v.id = voucher_id and v.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_delete_own" on public.%I for delete to authenticated
         using (exists (select 1 from public.zafirix_petty_cash_vouchers v where v.id = voucher_id and v.user_id = auth.uid()))',
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
