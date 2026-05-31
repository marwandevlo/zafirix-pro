-- Fix Storage INSERT RLS: foldername() returns directory segments only (not filename).
-- Path userId/companyId/documentId/file.pdf → foldername length 3, not 4.
-- Previous policy (array_length >= 4) blocked all authenticated uploads.

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
