-- Documents IA: raise storage bucket limit for large PDFs/images (50MB app limit).
-- Also allow processing_status = 'uploading' during direct client → Storage upload.

alter table public.atlas_documents drop constraint if exists atlas_documents_processing_status_check;
alter table public.atlas_documents add constraint atlas_documents_processing_status_check
  check (processing_status in ('uploading', 'uploaded', 'processing', 'processed', 'failed'));

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
