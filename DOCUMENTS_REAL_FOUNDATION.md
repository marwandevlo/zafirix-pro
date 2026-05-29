# Documents IA — Real Foundation (Sprint D-alt)

**Project:** ZAFIRIX PRO  
**Scope:** Production-grade document persistence, storage, and OCR lifecycle — no UI redesign, no billing/admin/auth changes.

## Audit Summary (Before Sprint D-alt)

| Area | Before | After Sprint D-alt |
|------|--------|------------------|
| Uploads | In-memory React state only | `POST /api/documents/upload` → Supabase Storage + DB row |
| OCR | Real `/api/ai` call, results lost on refresh | Persisted in `atlas_documents.content`, `extracted_text`, `metadata.ocr` |
| Parsing | Client-side JSON parse only | Same parse, saved via `saveAtlasDocumentOcrResult` |
| Storage | None | Private bucket `atlas-documents`, path `{userId}/{companyId}/{docId}/{filename}` |
| Persistence | Library partial Supabase; OCR ephemeral | Full Supabase with RLS + company scoping |
| AI calls | `fetchAi({ type: 'ocr' })` | Unchanged — real AI route, now tied to document lifecycle |
| localStorage | OCR in-memory; supplier invoices localStorage demo | Prod blocks localStorage authority; OCR uses Supabase only |
| Fake/demo flows | `+ Facture fournisseur` → localStorage | Hidden in Supabase mode |

## Schema (`atlas_documents`)

Core columns (baseline + Sprint D-alt):

- `user_id` — owner (RLS: `auth.uid() = user_id`)
- `company_id` — tenant scope (FK to `atlas_companies`, ownership checked on upload)
- `filename`, `mime_type`, `size_bytes`, `storage_path`
- `processing_status` — `uploaded` \| `processing` \| `processed` \| `failed`
- `extracted_text` — plain text / JSON string of OCR output
- `content` — structured OCR extraction (JSONB)
- `metadata` — `{ ocr: AtlasOcrExtraction }`
- `created_at`, `updated_at`

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/documents/upload` | POST | Multipart upload, company ownership check, storage + DB insert |
| `/api/documents/[id]/file` | GET | Signed URL for owned document file |

## Repository (`atlas-documents-repository.ts`)

- `listAtlasOcrDocuments(companyId)` — OCR tab list
- `updateAtlasDocumentProcessingStatus(id, status)` — lifecycle transitions
- `saveAtlasDocumentOcrResult(id, { extraction, processingStatus })` — OCR persistence
- `deleteAtlasDocument(id)` — DB + storage cleanup
- `getAtlasDocumentSignedUrl(storagePath)` — client signed access with path prefix check
- `requireOwnedDocument()` — ownership guard (via `atlas-entity-ownership.ts`)

## Processing Lifecycle

```
uploaded → processing → processed
                    └→ failed
```

1. Upload API sets `uploaded` + stores file.
2. Client sets `processing` before OCR.
3. On success: `processed` + extraction fields.
4. On AI/parse failure: `failed` (document row retained for retry/audit).

## Multi-Tenant Isolation

- **DB:** RLS on `atlas_documents` — user can only CRUD own rows.
- **Upload:** Server verifies `atlas_companies.id` belongs to session user.
- **Storage:** Path prefix `{userId}/`; storage RLS matches folder name to `auth.uid()`.
- **List:** OCR list filtered by active `company_id` via `requireOwnedCompany`.
- **Signed URLs:** Client path must start with `{auth.userId}/`.

## Production Guards

- `blockCriticalLocalStorageInProduction('atlas_documents')` — no localStorage authority in prod.
- `isAtlasSupabaseDataEnabled()` — documents page uses Supabase path when backend is `supabase`.
- Supplier invoice localStorage CTA disabled in Supabase mode.

## Migrations (run order)

1. `supabase/migrations/ensure_atlas_documents_baseline.sql` (if table missing)
2. `supabase/migrations/20260528150000_atlas_documents_real_foundation.sql`

## Storage Bucket

- **Name:** `atlas-documents` (private)
- **Limit:** 10 MB
- **MIME:** jpeg, png, webp, gif, pdf

## Remaining Fake / Beta Surfaces

- **Supplier invoices from OCR** — localStorage demo only; disabled in prod Supabase mode. Real supplier invoices = future sprint.
- **Library content preview** — shows JSON/text; no inline PDF/image viewer yet.
- **OCR retry UI** — failed docs persist but no dedicated “Retry OCR” button (re-upload required).
- **Beta badge** — `BetaSurfaceBadge` still shown on Documents page.

## Production Readiness

| Check | Status |
|-------|--------|
| DB persistence | ✅ Ready (after migrations) |
| File storage | ✅ Ready (bucket + RLS) |
| OCR persistence | ✅ Ready |
| Ownership / RLS | ✅ Ready |
| No prod localStorage authority | ✅ Ready |
| End-to-end OCR retry UX | ⚠️ Partial |
| Supplier invoice integration | ❌ Not in scope |

## Next Recommended Sprint

**Sprint E — Supplier Invoices REAL** or **Sprint D — Invoices REAL**: wire OCR extraction → real supplier invoice records on Supabase, remove localStorage supplier flow entirely, add OCR retry action for `failed` status.
