# Phase 16 — Backup Strategy

## Database (Supabase)

| Item | Policy |
|------|--------|
| Provider | Supabase managed Postgres |
| Daily backups | Enabled on Pro plan (verify project tier) |
| PITR | Enable Point-in-Time Recovery for production |
| Retention | 7 days daily; 30 days PITR window recommended |
| Manual export | `pg_dump` via Supabase CLI monthly for off-site copy |

## Storage (documents)

| Item | Policy |
|------|--------|
| Bucket | `atlas-documents` (Supabase Storage) |
| Versioning | Application-level via `zafirix_file_versions` |
| Backup | Replicate critical buckets to cold storage quarterly |
| RLS | User-scoped insert/select policies |

## Restore procedures

1. **Database PITR:** Supabase Dashboard → Database → Backups → restore to timestamp.
2. **Full restore:** Create new project from backup; update DNS/env; verify migrations applied.
3. **Storage:** Re-upload from off-site dump if bucket corruption detected.
4. **Verification:** Run `GET /api/health/dependencies` post-restore.

## Retention

| Data class | Retention |
|------------|-----------|
| Audit logs | 7 years (compliance) |
| Usage events | 24 months |
| AI interactions | 12 months |
| Admin logs | 24 months |
| Documents | Customer-controlled + legal hold |

## Phase 16 scope

Documentation only — no automated backup service implemented in application code.
