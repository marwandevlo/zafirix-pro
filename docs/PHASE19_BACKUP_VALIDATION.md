# Phase 19 — Backup Validation

**Date:** 2026-06-04  
**Reference:** `docs/PHASE16_BACKUP_STRATEGY.md`

---

## Supabase backups

| Control | Expected | Validation |
|---------|----------|------------|
| Daily backups | Enabled on Pro plan | Confirm in Supabase Dashboard |
| Backup retention | ≥ 7 days | Dashboard setting |
| Geographic redundancy | Supabase managed | Provider SLA |

---

## PITR (Point-in-Time Recovery)

| Control | Status |
|---------|--------|
| PITR enabled | **Required for GA** — verify plan tier |
| Recovery window | 7+ days recommended |
| Test restore | Schedule quarterly drill |

---

## Application-level backup

| Asset | Method |
|-------|--------|
| Documents | Supabase Storage + optional Google Drive (`/api/documents/[id]/backup-to-drive`) |
| Database | Supabase native backup / PITR |
| Audit events | `events` table in Postgres — included in DB backup |

---

## Restore procedure (summary)

1. **Database:** Supabase Dashboard → Database → Backups → Restore to new project or PITR timestamp.
2. **Storage:** Re-sync buckets from backup project or PITR-aligned storage snapshot.
3. **Secrets:** Re-apply Vercel env to restored project URLs/keys.
4. **Verification:** Run health checks, login, sample document OCR, billing read-only.

---

## RTO / RPO targets

| Metric | Target |
|--------|--------|
| RPO | ≤ 24h (PITR: ≤ 1h with PITR enabled) |
| RTO | ≤ 4h for full platform restore |

---

## Validation result

**Status:** Process documented. **Action before GA:** Confirm PITR enabled on production Supabase project and log one successful restore drill.
