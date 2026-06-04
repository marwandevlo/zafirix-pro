# Release Notes — RC Final (v1.0.0-rc-final)

**Release:** RC-2026.06 / GA-2026.06  
**Date:** 2026-06-04  
**Codename:** Atlas GA

---

## Overview

Final Release Candidate for Zafirix Atlas — enterprise SaaS for Moroccan business management, accounting, fiscal compliance, and AI-assisted operations.

---

## Platform highlights (Phases 1–18)

- **Documents IA** — OCR, routing, validation
- **Accounting & TVA** — Journal, declarations, liasse fiscale
- **Banking & Payroll** — Reconciliation, CNSS, IR
- **AI Copilot & Auditor** — Chat, insights, audit, executive summary
- **Multi-company & Cabinet** — Portfolio, consolidated dashboard
- **Billing foundation** — Plans, quotas, trials, usage metering
- **Security hardening** — RBAC, rate limits, Sentry, health APIs
- **Onboarding** — Setup wizard, help center, guided tour, demo mode
- **Release candidate** — 1012 automated checks, E2E matrix

---

## Phase 19 — Launch readiness

### Legal
- New legal hub at `/legal`
- Conditions générales, Politique de confidentialité, Politique cookies, Notice DPN (French)

### Operations
- Admin Operations Center at `/admin/operations`
- Health, errors, usage, quotas, audit coverage

### Documentation
- 14 launch readiness documents
- Incident response playbook
- Data retention policy
- Feature freeze policy activated

---

## Breaking changes

None — GA maintains RC API compatibility.

---

## Known limitations

- Paddle online payments optional (manual billing supported)
- Onboarding progress primarily client-side (localStorage)
- Assistant floating overlay disabled by default — use `/assistant`

---

## Upgrade path

Fresh deploy from tag `v1.0.0-rc-final`. Apply all Supabase migrations. Configure Vercel env per `PHASE19_ENV_AUDIT.md`.

---

## Verification

```
npx tsc --noEmit
npm run build
node scripts/verify-phase19-launch.mjs
```

---

**Status:** READY FOR COMMERCIAL LAUNCH  
**Feature freeze:** ACTIVE
