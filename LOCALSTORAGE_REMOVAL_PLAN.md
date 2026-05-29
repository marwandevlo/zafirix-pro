# ZAFIRIX PRO — localStorage removal plan

**Policy:** Critical business data must **not** rely on `localStorage` in production paths. `atlas-data-source.ts` already forces **`supabase`** when `NODE_ENV === 'production'`, but many pages still **read** `atlas_companies` / `atlas_company` keys or subscription caches from localStorage even when Supabase is on — those reads must be eliminated for SaaS integrity.

**Related:** `LOCALSTORAGE_MIGRATION_PLAN.md` (if present) — consolidate; this document is the **canonical removal plan** going forward.

---

## Inventory (from static grep — non-exhaustive)

| Key / module | Data | Risk | Target store |
|--------------|------|------|----------------|
| `ATLAS_STORAGE_KEYS.*` repos | clients, invoices, documents, employees, projects, links, payments, accounting, supplier invoices | Demo leakage / split brain | Supabase tables (existing) |
| `atlas_companies`, `atlas_company` | companies + active company | Wrong tenant context | `atlas_companies` + `profiles` or `user_preferences` for `active_company_id` |
| `subscription` page keys | plan cache | Wrong billing UX | `subscriptions` + `profiles.plan` |
| `PENDING_SUBSCRIPTIONS_STORAGE_KEY` | pending Paddle orders | Lost state / fraud confusion | Server session or DB `checkout_sessions` |
| `LOCAL_ADMIN_ROLE_KEY` | admin flag | **Critical security** | Remove; use JWT/profile only |
| `atlas_onboarding_prefs` | onboarding | OK as UX fluff only | Move to `profiles.metadata` or dedicated table |
| `ATLAS_FUNNEL_LOCAL_STORAGE_KEY` | funnel buffer | Non-authoritative | Keep only if clearly telemetry; prefer server |
| Analytics anonymous id | device id | Privacy | Acceptable if documented; consider first-party cookie |
| `proCompanyAddonSlots` | add-on slots | Billing inconsistency | DB linked to `subscriptions` / `orders` |

---

## Phased removal

### Phase A — P0 (blockers)

1. Remove **admin role** from localStorage entirely; gate admin UI only via middleware + optional dev-only env (never in prod builds).  
2. Ensure **active company id** is loaded from Supabase (profile or dedicated table), not `localStorage.getItem('atlas_company')` on: `settings`, `juridique`, `rh`, `etude-projet`, `consultant`, `companies` (post-migration).  
3. **Payment pending orders:** persist minimal row in Supabase or secure httpOnly session.

### Phase B — P1 (core SaaS)

4. **Subscription page:** treat localStorage strictly as optional optimistic cache; on load, always refetch `subscriptions` + `profiles`.  
5. **Signup demo seed:** already guarded — remove dead paths in production bundles where possible (tree-shake / `import.meta` patterns).  
6. **Accounting / supplier invoices:** wire repos to Supabase tables (migrations exist for accounting extensions — align repos).

### Phase C — P2 (UX / telemetry)

7. Funnel local buffer — either server-side buffer table or documented non-critical loss.  
8. Onboarding prefs — migrate to DB for cross-device continuity.

---

## Acceptance tests

- Log in on device 1, create invoice; log in on device 2 — invoice **visible**.  
- Clear site data on device 1 — user **does not** lose companies or subscription state.  
- Admin operations **never** depend on cleared localStorage.

---

## Non-goals

- Removing **all** browser storage (e.g. harmless UI collapse state) — not required unless privacy policy demands.
