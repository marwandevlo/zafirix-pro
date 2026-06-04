# Phase 19 — Data Retention Policy

**Date:** 2026-06-04  
**Effective:** GA launch

---

## Audit logs

| Data | Retention | Deletion |
|------|-----------|----------|
| `events` (analytics, audit) | 24 months | Anonymize after |
| Entity audit tables | Life of account + 3 years | On account deletion request |
| Admin logs | 12 months | Rolling |

---

## Documents

| Data | Retention |
|------|-----------|
| Uploaded files (Storage) | Until user deletes or account closure + 90 days |
| OCR extractions | Same as parent document |
| Archived documents | Soft-delete; purge after 180 days |

---

## Billing

| Data | Retention |
|------|-----------|
| Subscriptions history | 10 years (legal/accounting) |
| Usage events | 24 months |
| Payment requests | 10 years |

---

## AI interactions

| Data | Retention |
|------|-----------|
| Chat prompts/answers | 24 months |
| Audit AI reports | 24 months |
| Conversation metadata | 24 months |

User may request deletion subject to legal holds.

---

## Backups

| Data | Retention |
|------|-----------|
| Supabase daily backups | Per plan (7–30 days) |
| PITR window | Per Supabase tier |
| Google Drive copies | User-controlled |

---

## Account deletion

On confirmed deletion request:
1. Disable auth user
2. Schedule document storage purge (90 days)
3. Anonymize PII in events
4. Retain billing records per legal minimum

---

**Owner:** DPO / Platform team  
**Review cycle:** Annual
