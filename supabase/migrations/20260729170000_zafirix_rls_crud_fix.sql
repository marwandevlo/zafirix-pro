-- Fix RLS for enterprise modules + reinforce core atlas entity policies.
-- Replaces permissive service_all (using true for all roles) with proper CRUD + service_role-only bypass.

-- ── Enterprise module tables: full authenticated CRUD ─────────────────────────
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
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_all" on public.%I', tbl, tbl);
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

-- ── Core atlas entities (idempotent refresh) ──────────────────────────────────
-- atlas_invoices / atlas_clients — ensure CRUD policies exist (tables may predate normalized migrations).

alter table if exists public.atlas_invoices enable row level security;
alter table if exists public.atlas_clients enable row level security;

drop policy if exists "atlas_invoices_select_own" on public.atlas_invoices;
create policy "atlas_invoices_select_own" on public.atlas_invoices for select to authenticated using (auth.uid() = user_id);
drop policy if exists "atlas_invoices_insert_own" on public.atlas_invoices;
create policy "atlas_invoices_insert_own" on public.atlas_invoices for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "atlas_invoices_update_own" on public.atlas_invoices;
create policy "atlas_invoices_update_own" on public.atlas_invoices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "atlas_invoices_delete_own" on public.atlas_invoices;
create policy "atlas_invoices_delete_own" on public.atlas_invoices for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "atlas_invoices_service_role_all" on public.atlas_invoices;
create policy "atlas_invoices_service_role_all" on public.atlas_invoices for all to service_role using (true) with check (true);

drop policy if exists "atlas_clients_select_own" on public.atlas_clients;
create policy "atlas_clients_select_own" on public.atlas_clients for select to authenticated using (auth.uid() = user_id);
drop policy if exists "atlas_clients_insert_own" on public.atlas_clients;
create policy "atlas_clients_insert_own" on public.atlas_clients for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "atlas_clients_update_own" on public.atlas_clients;
create policy "atlas_clients_update_own" on public.atlas_clients for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "atlas_clients_delete_own" on public.atlas_clients;
create policy "atlas_clients_delete_own" on public.atlas_clients for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "atlas_clients_service_role_all" on public.atlas_clients;
create policy "atlas_clients_service_role_all" on public.atlas_clients for all to service_role using (true) with check (true);

-- Grant table access to authenticated role (Supabase default, idempotent).
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.atlas_invoices to authenticated;
grant select, insert, update, delete on public.atlas_clients to authenticated;
grant select, insert, update, delete on public.zafirix_stores to authenticated;
grant select, insert, update, delete on public.zafirix_inventory_items to authenticated;
grant select, insert, update, delete on public.zafirix_inventory_stock to authenticated;
grant select, insert, update, delete on public.zafirix_notifications to authenticated;
grant select, insert, update, delete on public.zafirix_deliveries to authenticated;
grant select, insert, update, delete on public.zafirix_petty_cash_entries to authenticated;
grant select, insert, update, delete on public.zafirix_debt_collection_cases to authenticated;
grant select, insert, update, delete on public.zafirix_auditor_passes to authenticated;
