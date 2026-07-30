-- Advanced multi-store inventory: movements ledger, transfers, COGS tracking.
-- Extends existing zafirix_stores / zafirix_inventory_items / zafirix_inventory_stock.

create extension if not exists "pgcrypto";

-- ── Extend catalog & stores ───────────────────────────────────────────────────
alter table public.zafirix_inventory_items
  add column if not exists unit_cost numeric(14,4) not null default 0,
  add column if not exists sale_price numeric(14,4) not null default 0,
  add column if not exists category text not null default '';

alter table public.zafirix_stores
  add column if not exists store_type text not null default 'point_of_sale';

alter table public.zafirix_stores
  drop constraint if exists zafirix_stores_type_check;
alter table public.zafirix_stores
  add constraint zafirix_stores_type_check
    check (store_type in ('warehouse', 'point_of_sale', 'both'));

-- ── Stock movement ledger ─────────────────────────────────────────────────────
create table if not exists public.zafirix_stock_movements (
  id               uuid          primary key default gen_random_uuid(),
  user_id          uuid          not null references auth.users (id) on delete cascade,
  company_id       uuid          references public.atlas_companies (id) on delete set null,
  store_id         uuid          not null references public.zafirix_stores (id) on delete cascade,
  item_id          uuid          not null references public.zafirix_inventory_items (id) on delete cascade,
  movement_type    text          not null,
  quantity_delta   numeric(12,3) not null,
  quantity_after   numeric(12,3) not null default 0,
  unit_cost        numeric(14,4) not null default 0,
  total_cost       numeric(14,2) not null default 0,
  reference_type   text,
  reference_id     text,
  notes            text,
  created_at       timestamptz   not null default now(),
  constraint zafirix_stock_movements_type_check
    check (movement_type in (
      'in', 'out', 'adjustment', 'transfer_in', 'transfer_out',
      'sale', 'usage', 'purchase', 'return'
    ))
);

create index if not exists zafirix_stock_movements_company_idx
  on public.zafirix_stock_movements (company_id, created_at desc);
create index if not exists zafirix_stock_movements_store_item_idx
  on public.zafirix_stock_movements (store_id, item_id, created_at desc);
create index if not exists zafirix_stock_movements_ref_idx
  on public.zafirix_stock_movements (reference_type, reference_id)
  where reference_id is not null;

-- ── Inter-store transfer requests ─────────────────────────────────────────────
create table if not exists public.zafirix_stock_transfers (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  company_id     uuid        references public.atlas_companies (id) on delete set null,
  from_store_id  uuid        not null references public.zafirix_stores (id) on delete restrict,
  to_store_id    uuid        not null references public.zafirix_stores (id) on delete restrict,
  status         text        not null default 'pending',
  notes          text,
  requested_at   timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint zafirix_stock_transfers_status_check
    check (status in ('pending', 'approved', 'in_transit', 'completed', 'cancelled')),
  constraint zafirix_stock_transfers_stores_distinct check (from_store_id <> to_store_id)
);

create index if not exists zafirix_stock_transfers_company_idx
  on public.zafirix_stock_transfers (company_id, status, created_at desc);

create table if not exists public.zafirix_stock_transfer_lines (
  id           uuid          primary key default gen_random_uuid(),
  transfer_id  uuid          not null references public.zafirix_stock_transfers (id) on delete cascade,
  item_id      uuid          not null references public.zafirix_inventory_items (id) on delete restrict,
  quantity     numeric(12,3) not null,
  unit_cost    numeric(14,4) not null default 0,
  constraint zafirix_stock_transfer_lines_qty_positive check (quantity > 0)
);

create index if not exists zafirix_stock_transfer_lines_transfer_idx
  on public.zafirix_stock_transfer_lines (transfer_id);

-- ── COGS records linked to sales invoices ─────────────────────────────────────
create table if not exists public.zafirix_invoice_cogs (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null references auth.users (id) on delete cascade,
  company_id   uuid          references public.atlas_companies (id) on delete set null,
  invoice_id   uuid          not null references public.atlas_invoices (id) on delete cascade,
  store_id     uuid          not null references public.zafirix_stores (id) on delete restrict,
  item_id      uuid          not null references public.zafirix_inventory_items (id) on delete restrict,
  quantity     numeric(12,3) not null,
  unit_cost    numeric(14,4) not null default 0,
  cogs_amount  numeric(14,2) not null default 0,
  movement_id  uuid          references public.zafirix_stock_movements (id) on delete set null,
  created_at   timestamptz   not null default now(),
  constraint zafirix_invoice_cogs_qty_positive check (quantity > 0)
);

create unique index if not exists zafirix_invoice_cogs_invoice_item_idx
  on public.zafirix_invoice_cogs (invoice_id, store_id, item_id);

create index if not exists zafirix_invoice_cogs_company_idx
  on public.zafirix_invoice_cogs (company_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_stock_movements',
    'zafirix_stock_transfers',
    'zafirix_stock_transfer_lines',
    'zafirix_invoice_cogs'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_stock_transfer_lines' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.zafirix_stock_transfers t where t.id = transfer_id and t.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.zafirix_stock_transfers t where t.id = transfer_id and t.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_update_own" on public.%I for update to authenticated
         using (exists (select 1 from public.zafirix_stock_transfers t where t.id = transfer_id and t.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_delete_own" on public.%I for delete to authenticated
         using (exists (select 1 from public.zafirix_stock_transfers t where t.id = transfer_id and t.user_id = auth.uid()))',
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
