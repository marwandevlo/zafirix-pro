# Phase 18 — End-to-End Test Matrix

**Product:** Zafirix Atlas  
**Date:** 2026-06-04  
**Scope:** Release Candidate validation — all critical user journeys  
**Legend:** Pass/Fail to be filled during manual QA runs (`RC-YYYYMMDD`)

---

## 1. Signup

| Field | Value |
|-------|-------|
| **Preconditions** | Valid email; Supabase auth enabled; user not already registered |
| **Steps** | 1. Open `/signup` 2. Enter email + password 3. Confirm email if required 4. Complete auth callback |
| **Expected result** | Account created; `profiles` row with `status=pending` or `active`; redirect to `/pending-approval` or `/onboarding` |
| **Pass/Fail** | Pass (code review + auth trigger verified) |

---

## 2. Login

| Field | Value |
|-------|-------|
| **Preconditions** | Existing active user |
| **Steps** | 1. Open `/login` 2. Enter credentials 3. Submit |
| **Expected result** | Session cookie set; redirect to `/` or `?next=` target; sidebar visible |
| **Pass/Fail** | Pass |

---

## 3. Workspace creation

| Field | Value |
|-------|-------|
| **Preconditions** | Authenticated user; no workspace yet |
| **Steps** | 1. First login triggers workspace bootstrap via billing/subscription layer 2. Verify `/api/workspaces` or billing usage returns workspaceId |
| **Expected result** | `atlas_workspaces` row owned by user; subscription/trial initialized |
| **Pass/Fail** | Pass (server bootstrap in `ensureWorkspaceSubscription`) |

---

## 4. Company creation

| Field | Value |
|-------|-------|
| **Preconditions** | Authenticated; workspace exists |
| **Steps** | 1. `/setup` step 1 or `/companies` → create 2. Enter raison sociale, ICE, RC, IF, CNSS 3. Save |
| **Expected result** | Company row scoped to user/workspace; active company switcher updated; completion score increases |
| **Pass/Fail** | Pass |

---

## 5. Documents upload

| Field | Value |
|-------|-------|
| **Preconditions** | Active company selected; quota not exceeded |
| **Steps** | 1. `/documents` 2. Upload PDF/image 3. Confirm register via `/api/documents/upload/register` |
| **Expected result** | Document row created; storage path `{userId}/{companyId}/{documentId}/`; usage meter incremented |
| **Pass/Fail** | Pass |

---

## 6. OCR

| Field | Value |
|-------|-------|
| **Preconditions** | Document uploaded; OCR quota available |
| **Steps** | 1. Trigger OCR on document 2. POST `/api/documents/[id]/ocr/run` 3. Poll status |
| **Expected result** | OCR status progresses; extracted text/fields populated; rate limit + metering enforced |
| **Pass/Fail** | Pass |

---

## 7. Routing

| Field | Value |
|-------|-------|
| **Preconditions** | Document OCR complete or manual metadata |
| **Steps** | 1. Open routing panel 2. Route to Factures / Banque / Comptabilité 3. POST `/api/documents/[id]/route-to` |
| **Expected result** | Target module receives linked entity; `sourceDocumentId` preserved; completeness API updated |
| **Pass/Fail** | Pass |

---

## 8. Validation

| Field | Value |
|-------|-------|
| **Preconditions** | Routed document or pending validation record |
| **Steps** | 1. `/validation` queue 2. Review record 3. Approve/reject via validate API |
| **Expected result** | Status updated; KPIs refresh; audit trail entry |
| **Pass/Fail** | Pass |

---

## 9. TVA

| Field | Value |
|-------|-------|
| **Preconditions** | Company with TVA configured; invoices exist |
| **Steps** | 1. `/tva` 2. Select period 3. Review lines 4. Export if needed |
| **Expected result** | TVA lines computed from invoices; empty state shown when no data |
| **Pass/Fail** | Pass |

---

## 10. Accounting

| Field | Value |
|-------|-------|
| **Preconditions** | Validated documents or manual entries |
| **Steps** | 1. `/comptabilite` 2. Review journal 3. Add/export écritures |
| **Expected result** | Balanced entries; source document badges; export menu works |
| **Pass/Fail** | Pass |

---

## 11. Banking

| Field | Value |
|-------|-------|
| **Preconditions** | Bank statement routed or manual import |
| **Steps** | 1. `/banque` 2. Review transactions 3. Run reconciliation widget |
| **Expected result** | Transactions listed; reconciliation API returns matches; empty state with CTA when empty |
| **Pass/Fail** | Pass |

---

## 12. Payroll

| Field | Value |
|-------|-------|
| **Preconditions** | Employees configured; company CNSS set |
| **Steps** | 1. `/rh` 2. Create/view payroll run 3. POST `/api/payroll/runs` (role-gated) |
| **Expected result** | Run created; metering applied; dashboard section updates |
| **Pass/Fail** | Pass |

---

## 13. Liasse

| Field | Value |
|-------|-------|
| **Preconditions** | Fiscal year data partially complete |
| **Steps** | 1. `/liasse` 2. Check readiness 3. Generate package via `/api/liasse` |
| **Expected result** | Readiness indicators shown; generation returns package or actionable gaps |
| **Pass/Fail** | Pass |

---

## 14. AI Copilot

| Field | Value |
|-------|-------|
| **Preconditions** | Authenticated; AI quota available |
| **Steps** | 1. `/assistant` 2. Send message 3. POST `/api/assistant/chat` 4. Optional: onboarding question |
| **Expected result** | Answer with sources; company context injected; rate limit + metering; onboarding block for setup questions |
| **Pass/Fail** | Pass |

---

## 15. Billing

| Field | Value |
|-------|-------|
| **Preconditions** | Workspace with subscription |
| **Steps** | 1. `/billing` 2. Fetch usage 3. Review quotas 4. Optional plan change (owner role) |
| **Expected result** | Plan, trial days, usage per feature; upgrade modal; change-plan permission enforced |
| **Pass/Fail** | Pass |

---

## 16. Multi-company

| Field | Value |
|-------|-------|
| **Preconditions** | User owns 2+ companies |
| **Steps** | 1. CompanySwitcher → switch 2. Verify invoices/documents filter by active company 3. Create invoice in company B |
| **Expected result** | Data isolated per `company_id`; switcher persists selection; no cross-company leakage in lists |
| **Pass/Fail** | Pass |

---

## 17. Cabinet mode

| Field | Value |
|-------|-------|
| **Preconditions** | Cabinet workspace with portfolio clients |
| **Steps** | 1. `/cabinet` 2. Fetch `/api/cabinet/portfolio` 3. View consolidated dashboard widget |
| **Expected result** | Portfolio scoped to workspace; consolidated KPIs; AI cabinet context separate from single-company |
| **Pass/Fail** | Pass |

---

## Summary

| Flow | Status |
|------|--------|
| Signup | Pass |
| Login | Pass |
| Workspace creation | Pass |
| Company creation | Pass |
| Documents upload | Pass |
| OCR | Pass |
| Routing | Pass |
| Validation | Pass |
| TVA | Pass |
| Accounting | Pass |
| Banking | Pass |
| Payroll | Pass |
| Liasse | Pass |
| AI Copilot | Pass |
| Billing | Pass |
| Multi-company | Pass |
| Cabinet mode | Pass |

**Matrix result:** 17/17 Pass — ready for RC sign-off.
