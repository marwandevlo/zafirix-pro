-- Storage RLS: user uploads under own prefix; service reads via user JWT in API routes.

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
    and array_length(storage.foldername(name), 1) >= 4
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
