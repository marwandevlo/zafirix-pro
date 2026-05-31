-- PRODUCTION HOTFIX: Atlas Documents Storage (idempotent — safe to re-run)
-- Run in Supabase SQL Editor if uploads fail with StorageApiError / RLS violations.
--
-- Fixes:
-- 1. processing_status includes 'uploading'
-- 2. bucket file_size_limit = 50 MB
-- 3. INSERT RLS: foldername length >= 3 (NOT 4 — filename is excluded from foldername)

-- ---------------------------------------------------------------------------
-- atlas_documents processing_status
-- ---------------------------------------------------------------------------
alter table public.atlas_documents drop constraint if exists atlas_documents_processing_status_check;
alter table public.atlas_documents add constraint atlas_documents_processing_status_check
  check (processing_status in ('uploading', 'uploaded', 'processing', 'processed', 'failed'));

-- ---------------------------------------------------------------------------
-- storage.buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atlas-documents',
  'atlas-documents',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- storage.objects RLS (authenticated, user-scoped path prefix)
-- Path: {userId}/{companyId}/{documentId}/{filename}
-- foldername(name) = [userId, companyId, documentId] → length 3
-- ---------------------------------------------------------------------------
drop policy if exists "atlas_documents_storage_select_own" on storage.objects;
create policy "atlas_documents_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'atlas-documents'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  );

drop policy if exists "atlas_documents_storage_insert_own" on storage.objects;
create policy "atlas_documents_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'atlas-documents'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
    and coalesce(array_length(storage.foldername(name), 1), 0) >= 3
  );

drop policy if exists "atlas_documents_storage_update_own" on storage.objects;
create policy "atlas_documents_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'atlas-documents'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'atlas-documents'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  );

drop policy if exists "atlas_documents_storage_delete_own" on storage.objects;
create policy "atlas_documents_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'atlas-documents'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- Verification (expect 52428800 and insert policy without ">= 4")
-- ---------------------------------------------------------------------------
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'atlas-documents';
-- select policyname, cmd, qual, with_check from pg_policies where tablename = 'objects' and policyname like 'atlas_documents_storage%';
