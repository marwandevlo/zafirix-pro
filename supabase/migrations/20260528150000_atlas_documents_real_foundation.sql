-- Sprint D-alt — Documents IA real foundation (idempotent).
-- Prerequisite: public.atlas_documents exists (ensure_atlas_documents_baseline.sql or 20260430030000).

-- Ensure company_id exists before any FK (safe on partial/legacy installs).
alter table public.atlas_documents add column if not exists company_id uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'atlas_companies'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atlas_documents'
      and column_name = 'company_id'
  ) and not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'atlas_documents'
      and constraint_name = 'atlas_documents_company_id_fkey'
  ) then
    alter table public.atlas_documents
      add constraint atlas_documents_company_id_fkey
      foreign key (company_id) references public.atlas_companies (id) on delete set null;
  end if;
end $$;

-- Legacy/partial installs: ensure repository columns exist (kind, title, source, status, etc.).
alter table public.atlas_documents add column if not exists title text;
alter table public.atlas_documents add column if not exists kind text;
alter table public.atlas_documents add column if not exists source text;
alter table public.atlas_documents add column if not exists status text;
alter table public.atlas_documents add column if not exists type text;
alter table public.atlas_documents add column if not exists content jsonb;
alter table public.atlas_documents add column if not exists metadata jsonb;
alter table public.atlas_documents add column if not exists created_at timestamptz;
alter table public.atlas_documents add column if not exists updated_at timestamptz;

alter table public.atlas_documents alter column kind set default 'ocr';
alter table public.atlas_documents alter column source set default 'upload';
alter table public.atlas_documents alter column status set default 'active';
alter table public.atlas_documents alter column type set default 'generic';
alter table public.atlas_documents alter column metadata set default '{}'::jsonb;
alter table public.atlas_documents alter column created_at set default now();
alter table public.atlas_documents alter column updated_at set default now();

update public.atlas_documents set kind = 'ocr' where kind is null;
update public.atlas_documents set source = 'upload' where source is null;
update public.atlas_documents set status = 'active' where status is null;
update public.atlas_documents set type = 'generic' where type is null;
update public.atlas_documents set metadata = '{}'::jsonb where metadata is null;
update public.atlas_documents set created_at = now() where created_at is null;
update public.atlas_documents set updated_at = now() where updated_at is null;

-- File metadata + OCR lifecycle columns
alter table public.atlas_documents add column if not exists filename text;
alter table public.atlas_documents add column if not exists mime_type text;
alter table public.atlas_documents add column if not exists size_bytes bigint;
alter table public.atlas_documents add column if not exists storage_path text;
alter table public.atlas_documents add column if not exists extracted_text text;
alter table public.atlas_documents add column if not exists processing_status text not null default 'uploaded';

update public.atlas_documents set title = coalesce(title, filename, 'Document') where title is null;
update public.atlas_documents set processing_status = 'uploaded' where processing_status is null;

alter table public.atlas_documents drop constraint if exists atlas_documents_processing_status_check;
alter table public.atlas_documents add constraint atlas_documents_processing_status_check
  check (processing_status in ('uploaded', 'processing', 'processed', 'failed'));

create index if not exists atlas_documents_processing_status_idx
  on public.atlas_documents (user_id, processing_status);

create index if not exists atlas_documents_storage_path_idx
  on public.atlas_documents (storage_path)
  where storage_path is not null;

create or replace function public.atlas_documents_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_documents_updated_at on public.atlas_documents;
create trigger atlas_documents_updated_at
  before update on public.atlas_documents
  for each row
  execute function public.atlas_documents_set_updated_at();

alter table public.atlas_documents enable row level security;

drop policy if exists "atlas_documents_select_own" on public.atlas_documents;
create policy "atlas_documents_select_own"
  on public.atlas_documents for select
  using (auth.uid() = user_id);

drop policy if exists "atlas_documents_insert_own" on public.atlas_documents;
create policy "atlas_documents_insert_own"
  on public.atlas_documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "atlas_documents_update_own" on public.atlas_documents;
create policy "atlas_documents_update_own"
  on public.atlas_documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "atlas_documents_delete_own" on public.atlas_documents;
create policy "atlas_documents_delete_own"
  on public.atlas_documents for delete
  using (auth.uid() = user_id);

-- Private bucket for uploaded files (not public).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atlas-documents',
  'atlas-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "atlas_documents_storage_select_own" on storage.objects;
create policy "atlas_documents_storage_select_own"
  on storage.objects for select
  using (
    bucket_id = 'atlas-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "atlas_documents_storage_insert_own" on storage.objects;
create policy "atlas_documents_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'atlas-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "atlas_documents_storage_update_own" on storage.objects;
create policy "atlas_documents_storage_update_own"
  on storage.objects for update
  using (
    bucket_id = 'atlas-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'atlas-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "atlas_documents_storage_delete_own" on storage.objects;
create policy "atlas_documents_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'atlas-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
