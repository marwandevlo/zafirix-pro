# Phase 19 — Monitoring Review

**Date:** 2026-06-04

---

## Sentry

| Item | Status |
|------|--------|
| Client config | `sentry.client.config.ts` |
| Server config | `sentry.server.config.ts` |
| Edge config | `sentry.edge.config.ts` |
| Error boundaries | `app/error.tsx`, `global-error.tsx` |
| `onRequestError` | `instrumentation.ts` |
| PII scrubbing | Review Sentry project settings |

---

## Health endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/health` | Public | Liveness |
| `GET /api/health/dependencies` | Public | DB, storage, AI, billing probes |
| `GET /api/health/metrics` | Admin | 24h usage aggregates |

---

## Metrics coverage

| Metric | Source |
|--------|--------|
| Active users 24h | `collectMetrics()` |
| AI / OCR usage | Usage events |
| Quota violations | Meter + events |
| API errors | Sentry + events |
| Payroll / bank imports | Usage events |

---

## Alert coverage (recommended)

| Alert | Channel | Threshold |
|-------|---------|-----------|
| Health degraded | Email/Slack | dependency status ≠ ok |
| Error spike | Sentry | >10/min new issues |
| Quota violations | Admin dashboard | >50/24h |
| Auth failure rate | Logs | Anomaly detection |

---

## Admin surfaces

| Page | URL |
|------|-----|
| Security dashboard | `/admin/security` |
| Operations center | `/admin/operations` |

---

## Verdict

Monitoring **adequate for GA**. Configure Sentry alerts and external uptime ping on `/api/health` before commercial launch.
