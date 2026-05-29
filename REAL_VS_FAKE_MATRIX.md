# ZAFIRIX PRO — Real vs fake matrix

Quick reference: what is safe to sell vs what must be hidden, relabeled, or rebuilt.

| User-facing capability | Shippable as “production”? | Reality | Action |
|-------------------------|----------------------------|---------|--------|
| Sign up / login (Supabase) | Yes (with hardening) | REAL | Session refresh, email verification policy, rate limits. |
| Private app routes (middleware) | Yes | PARTIAL | Ensure no false `access-denied` from profile lag; test cold login. |
| Multi-company management | Partial | PARTIAL | Supabase + RLS; purge legacy localStorage reads in production paths. |
| Clients CRUD | Partial | PARTIAL | Same; enforce `company_id` on all writes. |
| Invoices CRUD | Partial | PARTIAL | DB persistence; validate totals server-side eventually. |
| Invoice PDF export | Partial | PARTIAL | Likely client-side — disclose limitations; optional stored PDF later. |
| Payments — Paddle checkout | Partial | PARTIAL | Webhook + `subscriptions` upsert REAL; checkout route may be thin. |
| Payments — manual (CashPlus, etc.) | Partial | REAL | DB rows + admin mark paid; validate amounts vs catalog. |
| Admin — user list / edit | Partial | PARTIAL | Service role required for emails; audit logging incomplete. |
| Admin — payments queue | Partial | PARTIAL | Auth OK; extend validation + audit everywhere. |
| Subscription page state | No (as sole truth) | PARTIAL | localStorage must be cache only; see subscription plan doc. |
| Dashboard KPIs / fiscal “health” | Caution | PARTIAL | Must not imply official filing; disclaimers mandatory. |
| Consultant AI (fiscal) | Beta only | PARTIAL | REAL API calls; not audited advice — BETA + legal. |
| Juridique AI / templates | Beta only | PARTIAL | Same; human review mandatory. |
| OCR / document AI (`/api/ai` modes) | Beta only | PARTIAL | No enterprise OCR pipeline documented. |
| Document uploads | Partial | PARTIAL | Confirm Storage + virus scan + retention policy. |
| Full-text global search | Partial | PARTIAL | `/api/search` REAL under RLS; tune company query. |
| Client portal (`/client`) | **No** | **MOCK** | PIN 1234 + static data — **disable in prod or rebuild** with magic links. |
| RH module persistence | Partial | PARTIAL | DB exists; page still mixes localStorage company list. |
| Comptabilité / supplier invoices | Partial | PARTIAL | localStorage in non-Supabase mode; ensure prod never uses `local`. |
| Referral / funnel local buffer | Dev / edge | PARTIAL | localStorage buffer — OK only as non-authoritative telemetry buffer. |
| “Owner email” hardcoded admin | Ops risk | PARTIAL | REAL for bootstrapping; replace with role-only governance. |

**Rule of thumb:** If it survives **refresh + new device + second user** without Supabase rows, it is not yet “REAL” for SaaS.
