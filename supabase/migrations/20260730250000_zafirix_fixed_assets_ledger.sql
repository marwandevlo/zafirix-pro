-- Corporate Real Estate & Asset Ledger: fixed assets, depreciation schedules, GL linkage.

create extension if not exists "pgcrypto";

-- ── Fixed assets register ─────────────────────────────────────────────────────
create table if not exists public.zafirix_fixed_assets (
  id                      uuid          primary key default gen_random_uuid(),
  user_id                 uuid          not null references auth.users (id) on delete cascade,
  company_id              uuid          references public.atlas_companies (id) on delete cascade,
  asset_code              text          not null,
  name                    text          not null,
  description             text,
  asset_category          text          not null default 'equipment',
  asset_class             text          not null default 'corporel',
  location                text,
  pcge_asset_account      text          not null default '234000',
  pcge_amort_account      text          not null default '283400',
  pcge_charge_account     text          not null default '619300',
  acquisition_date        date          not null,
  acquisition_cost_ht     numeric(14,2) not null default 0,
  residual_value          numeric(14,2) not null default 0,
  useful_life_months      integer       not null default 60,
  depreciation_method     text          not null default 'linear',
  depreciation_start_date date,
  accumulated_depreciation numeric(14,2) not null default 0,
  book_value              numeric(14,2) not null default 0,
  status                  text          not null default 'active',
  source_document_id      uuid,
  source_invoice_id       uuid,
  disposal_date           date,
  disposal_amount         numeric(14,2),
  metadata                jsonb         not null default '{}'::jsonb,
  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now(),
  constraint zafirix_fixed_assets_category_check
    check (asset_category in ('real_estate','equipment','vehicle','it','furniture','other')),
  constraint zafirix_fixed_assets_class_check
    check (asset_class in ('corporel','incorporel','financier','non_valeur')),
  constraint zafirix_fixed_assets_method_check
    check (depreciation_method in ('linear')),
  constraint zafirix_fixed_assets_status_check
    check (status in ('draft','active','fully_depreciated','disposed'))
);

create unique index if not exists zafirix_fixed_assets_code_idx
  on public.zafirix_fixed_assets (company_id, asset_code);

create index if not exists zafirix_fixed_assets_company_idx
  on public.zafirix_fixed_assets (company_id, status, acquisition_date desc);

-- ── Depreciation schedule lines ───────────────────────────────────────────────
create table if not exists public.zafirix_depreciation_schedules (
  id                    uuid          primary key default gen_random_uuid(),
  user_id               uuid          not null references auth.users (id) on delete cascade,
  company_id            uuid          references public.atlas_companies (id) on delete cascade,
  asset_id              uuid          not null references public.zafirix_fixed_assets (id) on delete cascade,
  period_key            text          not null,
  period_start          date          not null,
  period_end            date          not null,
  opening_nbv             numeric(14,2) not null default 0,
  depreciation_amount     numeric(14,2) not null default 0,
  closing_nbv             numeric(14,2) not null default 0,
  status                text          not null default 'planned',
  accounting_entry_ids  uuid[]        not null default '{}',
  posted_at             timestamptz,
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now(),
  constraint zafirix_depreciation_schedules_status_check
    check (status in ('planned','posted','skipped')),
  constraint zafirix_depreciation_schedules_unique_period
    unique (asset_id, period_key)
);

create index if not exists zafirix_depreciation_schedules_asset_idx
  on public.zafirix_depreciation_schedules (asset_id, period_start);

create index if not exists zafirix_depreciation_schedules_company_idx
  on public.zafirix_depreciation_schedules (company_id, period_key, status);

-- ── Asset lifecycle events ────────────────────────────────────────────────────
create table if not exists public.zafirix_asset_events (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  asset_id     uuid        not null references public.zafirix_fixed_assets (id) on delete cascade,
  event_type   text        not null,
  title        text        not null,
  body         text,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint zafirix_asset_events_type_check
    check (event_type in (
      'created','schedule_generated','depreciation_posted','disposed','updated','acquisition_posted'
    ))
);

create index if not exists zafirix_asset_events_asset_idx
  on public.zafirix_asset_events (asset_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_fixed_assets',
    'zafirix_depreciation_schedules',
    'zafirix_asset_events'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl = 'zafirix_depreciation_schedules' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.zafirix_fixed_assets a where a.id = asset_id and a.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.zafirix_fixed_assets a where a.id = asset_id and a.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_update_own" on public.%I for update to authenticated
         using (exists (select 1 from public.zafirix_fixed_assets a where a.id = asset_id and a.user_id = auth.uid()))
         with check (exists (select 1 from public.zafirix_fixed_assets a where a.id = asset_id and a.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_delete_own" on public.%I for delete to authenticated
         using (exists (select 1 from public.zafirix_fixed_assets a where a.id = asset_id and a.user_id = auth.uid()))',
        tbl, tbl
      );
    elsif tbl = 'zafirix_asset_events' then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated using (auth.uid() = user_id)',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated with check (auth.uid() = user_id)',
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
