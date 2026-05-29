# Storage Architecture — Documents (Sprint D-alt)

## Bucket

| Property | Value |
|----------|-------|
| ID / name | `atlas-documents` |
| Public | `false` (private) |
| Max file size | 10 MB (`10485760` bytes) |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf` |

Defined in: `supabase/migrations/20260528150000_atlas_documents_real_foundation.sql`

Client constants: `app/lib/atlas-document-storage.ts`

## Object Path Layout

```
{userId}/{companyId}/{documentId}/{sanitizedFilename}
```

Example:

```
a1b2c3d4-.../e5f6g7h8-.../doc-uuid-.../facture-janvier.pdf
```

- **userId** — first path segment; used by storage RLS (`storage.foldername(name)[1] = auth.uid()`).
- **companyId** — tenant isolation at application layer (upload validates company ownership).
- **documentId** — matches `atlas_documents.id`.
- **sanitizedFilename** — stripped of unsafe characters via `sanitizeDocumentFilename()`.

## Upload Flow

1. Client POSTs multipart to `/api/documents/upload` with `file` + `companyId`.
2. Server validates auth, company ownership, MIME, size.
3. Server inserts `atlas_documents` row with `storage_path`.
4. Server uploads bytes to `atlas-documents` bucket.
5. On storage failure: DB row deleted (compensating transaction).

## Access Model

### Direct client access (repository)

`getAtlasDocumentSignedUrl(storagePath)`:

- Requires authenticated user.
- Path must start with `{userId}/` (fail-closed).
- Returns time-limited signed URL (default 3600s).

### Server route

`GET /api/documents/[id]/file`:

- Loads document by ID + `user_id`.
- Returns signed URL for `storage_path`.

No public URLs; bucket is private.

## Storage RLS Policies

On `storage.objects` for bucket `atlas-documents`:

| Policy | Operation | Rule |
|--------|-----------|------|
| `atlas_documents_storage_select_own` | SELECT | folder[1] = auth.uid() |
| `atlas_documents_storage_insert_own` | INSERT | folder[1] = auth.uid() |
| `atlas_documents_storage_update_own` | UPDATE | folder[1] = auth.uid() |
| `atlas_documents_storage_delete_own` | DELETE | folder[1] = auth.uid() |

## Delete Flow

`deleteAtlasDocument(id)`:

1. Verify ownership via `requireOwnedDocument`.
2. Delete DB row.
3. Remove storage object at `storage_path` (best-effort).

## Database Link

| Column | Purpose |
|--------|---------|
| `storage_path` | Full object key in bucket |
| `filename` | Original display name (sanitized) |
| `mime_type` | Content-Type |
| `size_bytes` | File size |

Index: `atlas_documents_storage_path_idx` (partial, where path not null).

## Security Checklist

- [x] Private bucket (no anonymous read)
- [x] User-scoped storage paths
- [x] Company ownership on upload
- [x] Signed URLs only for access
- [x] MIME + size enforced server-side
- [x] RLS on `atlas_documents` table
- [ ] Virus scanning (future)
- [ ] Server-side OCR from storage (future — avoid re-sending base64 from client)

## Manual Setup (if migration not applied)

In Supabase Dashboard → Storage:

1. Create bucket `atlas-documents`, private.
2. Set file size limit 10 MB.
3. Apply migration SQL for storage policies.

Or run migrations in order (see `DOCUMENTS_REAL_FOUNDATION.md`).
