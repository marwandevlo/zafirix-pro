-- Logistics & COD tracking: delivery partners, shipment tracking events, COD reconciliation.
-- Extends zafirix_deliveries (shipments). Idempotent.

create extension if not exists "pgcrypto";

-- ── Delivery partners (carriers) ─────────────────────────────────────────────
create table if not exists public.zafirix_delivery_partners (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  company_id            uuid        references public.atlas_companies (id) on delete cascade,
  name                  text        not null,
  code                  text        not null default '',
  phone                 text,
  tracking_url_template text,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists zafirix_delivery_partners_company_idx
  on public.zafirix_delivery_partners (company_id, name);

-- ── Extend shipments (deliveries) ────────────────────────────────────────────
alter table public.zafirix_deliveries
  add column if not exists partner_id uuid references public.zafirix_delivery_partners (id) on delete set null;

alter table public.zafirix_deliveries
  add column if not exists tracking_id text;

alter table public.zafirix_deliveries
  add column if not exists notes text;

create index if not exists zafirix_deliveries_invoice_idx
  on public.zafirix_deliveries (invoice_id) where invoice_id is not null;

create index if not exists zafirix_deliveries_tracking_idx
  on public.zafirix_deliveries (company_id, tracking_id) where tracking_id is not null;

-- ── Shipment tracking status history ───────────────────────────────────────────
create table if not exists public.zafirix_shipment_tracking_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  company_id  uuid        references public.atlas_companies (id) on delete set null,
  delivery_id uuid        not null references public.zafirix_deliveries (id) on delete cascade,
  status      text        not null,
  note        text,
  location    text,
  recorded_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint zafirix_shipment_tracking_status_check
    check (status in ('pending','in_transit','delivered','cod_collected','cancelled','returned'))
);

create index if not exists zafirix_shipment_tracking_delivery_idx
  on public.zafirix_shipment_tracking_events (delivery_id, recorded_at desc);

-- ── COD reconciliation ledger ─────────────────────────────────────────────────
create table if not exists public.zafirix_cod_reconciliations (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users (id) on delete cascade,
  company_id        uuid          references public.atlas_companies (id) on delete set null,
  delivery_id       uuid          not null references public.zafirix_deliveries (id) on delete cascade,
  invoice_id        uuid          references public.atlas_invoices (id) on delete set null,
  expected_amount   numeric(14,2) not null default 0,
  collected_amount  numeric(14,2) not null default 0,
  variance_amount   numeric(14,2) not null default 0,
  collection_method text          not null default 'cash',
  payment_id        uuid          references public.atlas_payments (id) on delete set null,
  notes             text,
  reconciled_at     timestamptz   not null default now(),
  created_at        timestamptz   not null default now(),
  constraint zafirix_cod_collection_method_check
    check (collection_method in ('cash','transfer','partner_settlement','other'))
);

create index if not exists zafirix_cod_reconciliations_company_idx
  on public.zafirix_cod_reconciliations (company_id, reconciled_at desc);

create index if not exists zafirix_cod_reconciliations_delivery_idx
  on public.zafirix_cod_reconciliations (delivery_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_delivery_partners',
    'zafirix_shipment_tracking_events',
    'zafirix_cod_reconciliations'
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
  end loop;
end $$;

grant select, insert, update, delete on public.zafirix_delivery_partners to authenticated;
grant select, insert, update, delete on public.zafirix_shipment_tracking_events to authenticated;
grant select, insert, update, delete on public.zafirix_cod_reconciliations to authenticated;

notify pgrst, 'reload schema';
