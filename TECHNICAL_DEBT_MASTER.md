# ZAFIRIX PRO — Technical debt master

Consolidated debt register (living document). **Do not** use this as permission to skip security items — prioritize via `SPRINT_EXECUTION_PLAN.md`.

---

## P0 — Security / correctness

| ID | Area | Debt | Impact |
|----|------|------|--------|
| TD-001 | Admin | localStorage admin role in dev | Misconfig → full compromise |
| TD-002 | Admin | Hardcoded owner email | Bus factor / wrong account recovery |
| TD-003 | API | No Zod on `app/api` | Invalid payloads, harder audits |
| TD-004 | Auth | Singleton `supabase` + `requireSupabaseUser` for repos | Future SSR misuse risk |
| TD-005 | Product | `/client` demo PIN + static data | Commercial fraud if shipped |
| TD-006 | Webhook | Paddle secret optional | Signature bypass if unset |

---

## P1 — Data model & UX integrity

| ID | Area | Debt | Impact |
|----|------|------|--------|
| TD-010 | Multi-tenant | Nullable `company_id` everywhere | Cross-company leakage in UI |
| TD-011 | Subscriptions | Multiple sources (`profiles`, `subscriptions`, LS) | Wrong gating |
| TD-012 | localStorage | Active company on `settings`, `rh`, `juridique` | Wrong context after clear |
| TD-013 | Invoices | Silent empty list on DB error | User thinks data deleted |
| TD-014 | Search | Company search pulls 50 rows | Cost at scale |

---

## P2 — Maintainability & scale

| ID | Area | Debt | Impact |
|----|------|------|--------|
| TD-020 | Next.js | Middleware deprecation warning (proxy migration) | Future upgrade friction |
| TD-021 | Types | `id: number \| string` on domain types | Complexity in components |
| TD-022 | AI | No async job queue | Timeouts on large docs |
| TD-023 | OCR | AI-only extraction | Accuracy vs dedicated OCR |

---

## P3 — Nice-to-have

| TD-030 | Generated API types from Supabase | DX | |
| TD-031 | E2E Playwright suite | Regression | |

---

## Retirement policy

When an item is fixed, move it to a **CHANGELOG** section at bottom with PR link and date.

### Changelog (fixed)

- _(None recorded by this audit file yet.)_

---

## References

- `SPRINT_EXECUTION_PLAN.md`  
- `PRODUCTION_AUDIT_MASTER.md`
