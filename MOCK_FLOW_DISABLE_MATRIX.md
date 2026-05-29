# Mock flow disable matrix — Sprint 0

Quick reference: what is **blocked**, **gated**, or **still dev-only**.

| Flow | Environment | Behavior after Sprint 0 |
|------|-------------|-------------------------|
| `/client` mock (PIN 1234, static KPIs) | Production (default) | **Disabled** — informational screen, no mock login |
| `/client` mock | Production + `NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true` | **Enabled** (staging / internal only) |
| `/client` mock | Development | **Enabled** — labeled “démo” in UI |
| Analytics → localStorage funnel buffer | Production | **Disabled** — warn on failure; no silent local “fake” persistence |
| Analytics → localStorage funnel buffer | Development | **Allowed** when Supabase off or request fails |
| Manual payment → `writePendingSubscription` (local only) | Production | **Blocked** — error message; Supabase path required |
| Manual payment → `writePendingSubscription` | Development + local backend | **Allowed** (unchanged) |
| Paddle webhook without secret | Production | **503** `webhook_secret_required` |
| Paddle webhook without secret | Development | **Warn** + accept (no signature check) |
| `read*FromLocalStorage` for atlas invoices/clients/companies | Production browser | **Returns empty / no-op** + one-time console warn per store |
| Onboarding checklist company/client counts | Supabase | **Fixed** — uses `listAtlasCompanies` / `listAtlasClients` (not local-only reads) |

---

## Not changed in Sprint 0 (documented for clarity)

| Flow | Notes |
|------|--------|
| `settings` / `rh` / `juridique` loading `atlas_companies` from localStorage | Still present — Sprint 1+ (`LOCALSTORAGE_REMOVAL_PLAN.md`) |
| Admin localStorage role (dev) | Unchanged — see `SECURITY_HARDENING_PLAN.md` |
| Global search client-side demo branch | Unreachable in prod (`isAtlasSupabaseDataEnabled()` true) |

---

## Verification checklist

- [ ] Production deploy: open `/client` → see disabled message, not PIN flow  
- [ ] Production: POST Paddle webhook without `Paddle-Signature` / wrong secret → rejected when secret configured  
- [ ] Production: `trackEvent` with broken network → no new keys in `localStorage` for `atlas_funnel_events_local`  
- [ ] Staging with flag: `/client` demo works when explicitly enabled  
