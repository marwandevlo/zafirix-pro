-- Sprint E — atlas_supplier_invoices hardening (idempotent).
-- OCR → supplier invoice records with document_id link.
--
-- PREREQUISITE: public.atlas_supplier_invoices must exist.
-- If missing, run first: supabase/migrations/ensure_atlas_supplier_invoices_baseline.sql

create or replace function public.atlas_supplier_invoices_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_supplier_invoices_updated_at on public.atlas_supplier_invoices;
create trigger atlas_supplier_invoices_updated_at
  before update on public.atlas_supplier_invoices
  for each row
  execute function public.atlas_supplier_invoices_set_updated_at();

create index if not exists atlas_supplier_invoices_user_company_idx
  on public.atlas_supplier_invoices (user_id, company_id);

create index if not exists atlas_supplier_invoices_status_idx
  on public.atlas_supplier_invoices (user_id, status);

-- Dedupe rows that would violate the partial unique index (keep newest per user + document).
delete from public.atlas_supplier_invoices a
using public.atlas_supplier_invoices b
where a.document_id is not null
  and b.document_id is not null
  and a.user_id = b.user_id
  and a.document_id = b.document_id
  and a.created_at < b.created_at;

-- Re-assert idempotency index (safe if baseline already created it).
create unique index if not exists atlas_supplier_invoices_user_document_unique
  on public.atlas_supplier_invoices (user_id, document_id)
  where document_id is not null;

alter table public.atlas_supplier_invoices enable row level security;

drop policy if exists "atlas_supplier_invoices_select_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_select_own"
  on public.atlas_supplier_invoices for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_supplier_invoices_insert_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_insert_own"
  on public.atlas_supplier_invoices for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_supplier_invoices_update_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_update_own"
  on public.atlas_supplier_invoices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_supplier_invoices_delete_own" on public.atlas_supplier_invoices;
create policy "atlas_supplier_invoices_delete_own"
  on public.atlas_supplier_invoices for delete
  using (auth.uid() = user_id);
