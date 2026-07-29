-- Zafirix Pro enterprise modules: inventory, notifications, logistics, petty cash, debt collection, auditor passes.
-- Idempotent.

create extension if not exists "pgcrypto";

-- ── Multi-store branches ──────────────────────────────────────────────────────
create table if not exists public.zafirix_stores (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  company_id  uuid        references public.atlas_companies (id) on delete cascade,
  name        text        not null,
  code        text        not null default '',
  address     text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists zafirix_stores_company_idx on public.zafirix_stores (company_id, created_at desc);

-- ── Inventory items (SKU catalog) ─────────────────────────────────────────────
create table if not exists public.zafirix_inventory_items (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  company_id     uuid        references public.atlas_companies (id) on delete cascade,
  sku            text        not null,
  name           text        not null,
  unit           text        not null default 'unité',
  reorder_level  numeric(12,3) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists zafirix_inventory_items_sku_idx
  on public.zafirix_inventory_items (company_id, sku);

-- ── Stock per store / branch ──────────────────────────────────────────────────
create table if not exists public.zafirix_inventory_stock (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  company_id  uuid        references public.atlas_companies (id) on delete cascade,
  store_id    uuid        not null references public.zafirix_stores (id) on delete cascade,
  item_id     uuid        not null references public.zafirix_inventory_items (id) on delete cascade,
  quantity    numeric(12,3) not null default 0,
  updated_at  timestamptz not null default now(),
  constraint zafirix_inventory_stock_unique unique (store_id, item_id)
);

create index if not exists zafirix_inventory_stock_item_idx on public.zafirix_inventory_stock (item_id);

-- ── Omnichannel notifications ─────────────────────────────────────────────────
create table if not exists public.zafirix_notifications (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  channel      text        not null default 'in_app',
  category     text        not null,
  title        text        not null,
  body         text,
  entity_type  text,
  entity_id    text,
  status       text        not null default 'pending',
  scheduled_at timestamptz,
  sent_at      timestamptz,
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  constraint zafirix_notifications_channel_check check (channel in ('in_app','email','whatsapp')),
  constraint zafirix_notifications_status_check check (status in ('pending','sent','failed','cancelled'))
);

create index if not exists zafirix_notifications_user_idx
  on public.zafirix_notifications (user_id, created_at desc);
create index if not exists zafirix_notifications_company_idx
  on public.zafirix_notifications (company_id, status, created_at desc);

-- ── Logistics / COD deliveries ────────────────────────────────────────────────
create table if not exists public.zafirix_deliveries (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        references public.atlas_companies (id) on delete set null,
  invoice_id      uuid        references public.atlas_invoices (id) on delete set null,
  waybill_number  text        not null,
  carrier         text,
  status          text        not null default 'pending',
  cod_amount      numeric(14,2) not null default 0,
  cod_collected   numeric(14,2) not null default 0,
  tracking_url    text,
  recipient_name  text,
  recipient_phone text,
  delivered_at    timestamptz,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zafirix_deliveries_status_check
    check (status in ('pending','in_transit','delivered','cod_collected','cancelled','returned'))
);

create index if not exists zafirix_deliveries_company_idx
  on public.zafirix_deliveries (company_id, created_at desc);

-- ── Petty cash ledger ─────────────────────────────────────────────────────────
create table if not exists public.zafirix_petty_cash_entries (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  entry_type   text        not null,
  amount       numeric(14,2) not null,
  beneficiary  text,
  purpose      text,
  status       text        not null default 'pending',
  entry_date   date        not null default current_date,
  approved_by  text,
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  constraint zafirix_petty_cash_type_check check (entry_type in ('advance','expense','replenishment')),
  constraint zafirix_petty_cash_status_check check (status in ('pending','approved','rejected','reimbursed'))
);

create index if not exists zafirix_petty_cash_company_idx
  on public.zafirix_petty_cash_entries (company_id, entry_date desc);

-- ── Debt collection workflow ──────────────────────────────────────────────────
create table if not exists public.zafirix_debt_collection_cases (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        references public.atlas_companies (id) on delete set null,
  invoice_id      uuid        references public.atlas_invoices (id) on delete set null,
  client_name     text        not null,
  amount_due      numeric(14,2) not null default 0,
  stage           text        not null default 'reminder_1',
  last_contact_at timestamptz,
  next_action_at  timestamptz,
  notes           text,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zafirix_debt_stage_check
    check (stage in ('reminder_1','reminder_2','formal_notice','legal','closed','paid'))
);

create index if not exists zafirix_debt_collection_company_idx
  on public.zafirix_debt_collection_cases (company_id, stage, created_at desc);

-- ── Auditor guest passes (token-based external access) ────────────────────────
create table if not exists public.zafirix_auditor_passes (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  token        text        not null unique,
  label        text        not null,
  scope        text        not null default 'read_only',
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  access_count integer     not null default 0,
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  constraint zafirix_auditor_passes_scope_check check (scope in ('read_only','audit_export'))
);

create index if not exists zafirix_auditor_passes_token_idx
  on public.zafirix_auditor_passes (token) where revoked_at is null;

-- ── RLS (user-owned rows + service role bypass) ───────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_stores','zafirix_inventory_items','zafirix_inventory_stock',
    'zafirix_notifications','zafirix_deliveries','zafirix_petty_cash_entries',
    'zafirix_debt_collection_cases','zafirix_auditor_passes'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format(
      'create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id)',
      tbl, tbl
    );
    execute format('drop policy if exists "%s_service_all" on public.%I', tbl, tbl);
    execute format(
      'create policy "%s_service_all" on public.%I for all using (true)',
      tbl, tbl
    );
  end loop;
end $$;
