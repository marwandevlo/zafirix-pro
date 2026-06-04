# Phase 18 — Bug Registry

**Date:** 2026-06-04  
**Release:** RC-2026.06  
**Critical blockers for RC:** 0

---

## Critical

| ID | Description | Impact | Fix status |
|----|-------------|--------|------------|
| — | *No critical bugs open* | — | — |

---

## High

| ID | Description | Impact | Fix status |
|----|-------------|--------|------------|
| — | *No high-severity bugs open* | — | — |

---

## Medium

| ID | Description | Impact | Fix status |
|----|-------------|--------|------------|
| BUG-18-001 | Onboarding profile page writes `phone`/`company` columns; profiles schema uses `company_name` — optional fields may not persist | Profile enrichment incomplete on first run | **Open** — non-blocking; `/setup` captures company data |
| BUG-18-002 | Onboarding progress stored primarily in localStorage | Progress not synced across devices | **Accepted** — events API logs milestones; post-RC enhancement |
| BUG-18-003 | Guided tour uses modal overlay without DOM spotlight | Tour less precise on complex layouts | **Accepted** — Phase 17 limitation |

---

## Low

| ID | Description | Impact | Fix status |
|----|-------------|--------|------------|
| BUG-18-004 | Assistant overlay disabled unless `NEXT_PUBLIC_ATLAS_ENABLE_ASSISTANT_OVERLAY=true` | Floating copilot launcher hidden by default | **By design** — `/assistant` route available |
| BUG-18-005 | Next.js middleware deprecation warning (`middleware` → `proxy`) | Console warning on build | **Open** — framework migration post-RC |
| BUG-18-006 | OCR debug row visible only with `NEXT_PUBLIC_ATLAS_OCR_DEBUG` | Dev-only; no production impact | **By design** |
| BUG-18-007 | Fiscal deadline widgets on dashboard are indicative | Users may misread as live obligations | **Mitigated** — amber disclaimer banner on dashboard |
| BUG-18-008 | Demo workspace is session-scoped | Demo data lost on tab close | **Accepted** — isolation requirement |

---

## Edge case review outcomes

| Scenario | Expected behavior | Outcome |
|----------|-------------------|---------|
| Empty companies | Setup wizard + empty states guide user | Pass |
| Large companies (many invoices) | Pagination/export; client-side filters | Pass (monitor perf) |
| No invoices | EmptyStateCta on `/factures` | Pass |
| No TVA configured | ModuleEmptyState + smart recommendation | Pass |
| Expired trial | Billing page shows expired; quotas enforced | Pass |
| Quota exceeded | 429 / quota error from meter API | Pass |
| Missing payroll | RH empty guidance; checklist item open | Pass |
| Missing banking | Banque ModuleEmptyState | Pass |
| AI provider unavailable | Copilot returns graceful error; health probe flags | Pass |

---

## Registry summary

| Severity | Open | Accepted | Fixed |
|----------|------|----------|-------|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 1 | 2 | 0 |
| Low | 2 | 3 | 0 |

**RC impact:** No critical or high bugs. Release candidate **not blocked** by open defects.
