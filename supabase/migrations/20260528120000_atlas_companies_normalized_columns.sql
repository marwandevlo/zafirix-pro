-- Sprint A — normalized company columns (idempotent).
-- Core fields live in columns; extended fields remain in company_json.

alter table public.atlas_companies add column if not exists name text;
alter table public.atlas_companies add column if not exists legal_form text;
alter table public.atlas_companies add column if not exists if_fiscal text;
alter table public.atlas_companies add column if not exists ice text;
alter table public.atlas_companies add column if not exists rc text;

-- Backfill from legacy company_json payload.
update public.atlas_companies
set
  name = coalesce(
    nullif(trim(name), ''),
    nullif(trim(company_json->>'raisonSociale'), ''),
    'Sans nom'
  ),
  legal_form = coalesce(
    nullif(trim(legal_form), ''),
    nullif(trim(company_json->>'formeJuridique'), '')
  ),
  if_fiscal = coalesce(
    nullif(trim(if_fiscal), ''),
    nullif(trim(company_json->>'if_fiscal'), '')
  ),
  ice = coalesce(
    nullif(trim(ice), ''),
    nullif(trim(company_json->>'ice'), '')
  ),
  rc = coalesce(
    nullif(trim(rc), ''),
    nullif(trim(company_json->>'rc'), '')
  )
where
  name is null
  or trim(name) = ''
  or legal_form is null
  or if_fiscal is null
  or ice is null
  or rc is null;

update public.atlas_companies
set name = 'Sans nom'
where name is null or trim(name) = '';

alter table public.atlas_companies alter column name set default '';
alter table public.atlas_companies alter column name set not null;

create index if not exists atlas_companies_user_active_idx
  on public.atlas_companies (user_id, is_active);

-- Keep updated_at in sync on every update.
create or replace function public.atlas_companies_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_companies_updated_at on public.atlas_companies;
create trigger atlas_companies_updated_at
  before update on public.atlas_companies
  for each row
  execute function public.atlas_companies_set_updated_at();

-- Re-affirm RLS (idempotent).
alter table public.atlas_companies enable row level security;

drop policy if exists "atlas_companies_select_own" on public.atlas_companies;
create policy "atlas_companies_select_own"
  on public.atlas_companies for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_companies_insert_own" on public.atlas_companies;
create policy "atlas_companies_insert_own"
  on public.atlas_companies for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_companies_update_own" on public.atlas_companies;
create policy "atlas_companies_update_own"
  on public.atlas_companies for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_companies_delete_own" on public.atlas_companies;
create policy "atlas_companies_delete_own"
  on public.atlas_companies for delete
  using (auth.uid() = user_id);
