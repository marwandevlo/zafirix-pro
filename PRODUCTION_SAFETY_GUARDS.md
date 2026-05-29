# Production safety guards (ZAFIRIX PRO)

Sprint 0 reference: how the app fails closed or warns when configuration or code paths are unsafe.

---

## 1. Startup (Node runtime)

**Module:** `app/lib/atlas-production-config.ts`  
**Hook:** `instrumentation.ts` → `register()` imports and runs `validateProductionConfiguration()` when `NEXT_RUNTIME === 'nodejs'`.

**Checks (production only):**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **error** log if missing  
- `PADDLE_WEBHOOK_SECRET` — **error** log if missing (webhook route also **503** if unset)  
- `SUPABASE_SERVICE_ROLE_KEY` — **warn** if missing (admin + analytics insert + webhooks)  
- `PADDLE_API_KEY` — **warn** if missing  

Logs use prefix **`[atlas:prod-config]`**. This does **not** exit the process (deploy flexibility); treat missing critical vars as release blockers in your pipeline.

---

## 2. Paddle webhooks

**Route:** `app/api/webhooks/paddle/route.ts`

- **Production:** `PADDLE_WEBHOOK_SECRET` required; missing → `503` + `webhook_secret_required`  
- **Non-production:** if secret unset → **warn** once per process pattern + body still parsed (local testing only); if secret set → signature verified  

---

## 3. Mock client portal

**Flag:** `app/lib/atlas-sprint0-flags.ts` → `isClientPortalDemoEnabled()`

- **Default production:** mock UI **off** (static message + link home)  
- **Opt-in:** `NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true`  

---

## 4. Analytics “fake” local buffer

**Module:** `app/lib/analytics-track.ts`

- In **production**, failed `/api/analytics/track` or missing Supabase mode does **not** append to `localStorage` funnel buffer (warn only).  
- **Development:** prior behavior preserved (local buffer when backend is `local` or request fails).

**Module:** `app/lib/atlas-funnel-local-buffer.ts` — `appendLocalFunnelEvent` respects `blockCriticalLocalStorageInProduction`.

---

## 5. Payment local fallback

**Module:** `app/payment/PaymentClient.tsx`

- Manual payment without Supabase in **production** → user-visible error, no fake pending order in `localStorage`.

---

## 6. Critical repository localStorage (defense in depth)

**Module:** `app/lib/atlas-runtime-guards.ts` → `blockCriticalLocalStorageInProduction(store)`

Used in:

- `atlas-invoices-repository` (read/write local)  
- `atlas-clients-repository`  
- `atlas-companies-repository` (companies + active company reads)  
- `atlas-funnel-local-buffer`  

Primary guard remains `atlasDataBackend()` forcing `supabase` in production; this blocks accidental direct `localStorage` use if `NODE_ENV === 'production'` in the browser.

---

## 7. Structured logging — recommendations

| Area | Recommendation |
|------|----------------|
| Correlation | Propagate `x-request-id` from edge / generate per request; pass to `logAtlasServerEvent` |
| Fields | `level`, `service`, `route`, `userId` (hashed if needed), `code`, `durationMs` — avoid raw PII |
| Errors | Log server-side detail; client gets generic `error` code |
| Webhooks | Log `event_type` + subscription id, **not** full payload with PII |
| Admin | Log `adminUserId` + target id + action name (append-only audit table) |
| Sink | stdout JSON in container; or OpenTelemetry → vendor |

Existing helpers: `app/lib/atlas-server-log.ts`, Sentry in `instrumentation.ts`.

---

## Related

- `MOCK_FLOW_DISABLE_MATRIX.md`  
- `SPRINT_0_COMPLETION.md`  
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md`
