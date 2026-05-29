-- Sprint C — atlas_clients hardening (idempotent).
-- App layer requires company_id on writes; DB keeps nullable for legacy rows.
--
-- PREREQUISITE: public.atlas_clients must exist.
-- If missing, run first: supabase/migrations/ensure_atlas_clients_baseline.sql
-- (or apply 20260430030000_atlas_saas_entities_links.sql on a fresh DB).

create or replace function public.atlas_clients_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_clients_updated_at on public.atlas_clients;
create trigger atlas_clients_updated_at
  before update on public.atlas_clients
  for each row
  execute function public.atlas_clients_set_updated_at();

create index if not exists atlas_clients_user_company_idx
  on public.atlas_clients (user_id, company_id);

alter table public.atlas_clients enable row level security;

drop policy if exists "atlas_clients_select_own" on public.atlas_clients;
create policy "atlas_clients_select_own"
  on public.atlas_clients for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_clients_insert_own" on public.atlas_clients;
create policy "atlas_clients_insert_own"
  on public.atlas_clients for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_clients_update_own" on public.atlas_clients;
create policy "atlas_clients_update_own"
  on public.atlas_clients for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_clients_delete_own" on public.atlas_clients;
create policy "atlas_clients_delete_own"
  on public.atlas_clients for delete
  using (auth.uid() = user_id);
