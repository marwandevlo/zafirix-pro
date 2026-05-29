# Stabilization Roadmap — ZAFIRIX PRO

**Mode:** Stabilization (no new features, no redesign).  
**Sources:** `AUDIT_REPORT.md`, `SECURITY_ISSUES.md`, `TECH_DEBT.md`, `SUBSCRIPTION_SOURCE_OF_TRUTH.md`, `EXECUTION_PLAN.md`.

---

## North star

One **Supabase-backed** persistence path for **invoices, clients, companies, payments**, with **RLS** as the isolation boundary and **admin** changes auditable and authenticated.

---

## Sprint 0 (docs — done / parallel)

| Deliverable | File |
|-------------|------|
| Stabilization roadmap | `STABILIZATION_ROADMAP.md` (this file) |
| Core backend rules | `CORE_BACKEND_PLAN.md` |
| localStorage exit | `LOCALSTORAGE_MIGRATION_PLAN.md` |
| API hardening checklist | `API_HARDENING_CHECKLIST.md` |

---

## Sprint 1 — Auth + profiles + admin + invoices + clients (+ companies persistence)

**Goals**

1. **Clients page:** Load/save/delete via `atlas-clients-repository` when Supabase — **no** `readClientsFromLocalStorage` / `writeClientsToLocalStorage` on that path.  
2. **Invoices page:** No demo seed or `writeInvoicesToLocalStorage` when Supabase; new invoice ids use **UUID**.  
3. **Companies page:** Load/save/delete/active via **new** `atlas-companies-repository` mutations — **no** `atlas_companies` localStorage when Supabase.  
4. **Repositories:** `deleteAtlasClient`; company `upsert` / `delete` / `setActiveCompany`.  
5. **Admin:** Tighten validation on highest-risk route (documented in `API_HARDENING_CHECKLIST.md`); full audit in Sprint 2.

**Exit criteria**

- `npm run build` green.  
- Manual smoke: logged-in user creates client + invoice + company on staging Supabase; refresh persists; second user cannot see data (RLS).

---

## Sprint 2 — Payments + subscription read path

- Payment pending UI → DB only.  
- Begin **single entitlement reader** (design in `SUBSCRIPTION_SOURCE_OF_TRUTH.md`) — optional thin server helper, no full migration yet.

---

## Sprint 3 — Remaining localStorage consumers

- Settings / juridique / RH / consultant / étude → active company from DB.  
- Usage limits from server counts.  
- Funnel buffer / analytics disclosure or server-only.

---

## Sprint 4 — Subscription write unification

- Execute phased migration from `SUBSCRIPTION_SOURCE_OF_TRUTH.md` (Paddle webhook + `atlas_subscriptions` + `profiles.plan`).

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| RLS misconfiguration | Staging matrix per table before prod |
| UUID vs number id in UI | Type `number \| string` on entities; tests |
| Partial migration | Feature flags per module (no new UX — env only) |

---

## Dependencies

- All `supabase/migrations` applied to target project.  
- `NEXT_PUBLIC_ATLAS_DATA_BACKEND=supabase` on staging hosts.
