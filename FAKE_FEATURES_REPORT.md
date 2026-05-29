# ZAFIRIX PRO — Fake / Demo / Misleading Features Report

This document lists **user-visible or sales-visible** capabilities that are **not** backed by production-grade domain logic, and why that matters.

---

## 1. Dashboard (`/`)

| Item | Reality |
|------|---------|
| “TVA à payer: 0 MAD” | **MOCK** — hardcoded in KPI array (`app/page.tsx`). |
| “Déclarations dues: 2” | **MOCK** — static string. |
| Fiscal deadline cards | **MOCK** — static `deadlines` array. |
| Invoice-derived KPIs | **PARTIAL** — real only if invoices load from DB |

**Risk:** Users believe the dashboard reflects **DGI position** or **obligations** — **misrepresentation**.

---

## 2. TVA module (`/tva`)

| Item | Reality |
|------|---------|
| Invoice lines | **MOCK** — `useState` seed data; lives in RAM until refresh. |
| XML “declaration” | **MOCK** — string concatenation, not certified channel. |

**Risk:** **Tax compliance fraud** if marketed as filing-ready.

---

## 3. IS / IR modules

Same **prototype pattern** as TVA (static / local state). Treat as **MOCK** for statutory purposes unless refactored to persisted, validated models.

---

## 4. Comptabilité (`/comptabilite`)

| Item | Reality |
|------|---------|
| Journal lines (`ecritures`) | **MOCK** — hardcoded French PCG-style demo rows. |
| “Add line” | **MOCK** — UI only; not a double-entry ledger with controls. |
| KPIs from invoices/payments | **PARTIAL** — can reflect real invoice data |

**Risk:** **Accounting misstatement** if used for audits or banks.

---

## 5. Consultant / Agents / Juridique / RH / Étude

| Item | Reality |
|------|---------|
| AI answers | **PARTIAL** — LLM output; disclaimers in prompts ≠ product disclaimer UX. |
| Generated contracts / HR docs | **PARTIAL** — client-side docx/pdf; **not** lawyer-reviewed per case. |
| Étude “feasibility” | **MOCK** — spreadsheet-style math + PDF packaging |

**Risk:** **Unauthorized practice of law / labor advice** positioning if sold as “compliant documents”.

---

## 6. Rapports (`/rapports`)

**MOCK** as **regulatory filing** — jsPDF templates. Fine as **internal** printouts if labeled.

---

## 7. Subscription / usage

| Item | Reality |
|------|---------|
| `atlas-usage-limits` | **MOCK** for billing enforcement — client/localStorage model |
| Subscription page | **PARTIAL** — mixes Supabase reads and local demo storage patterns |

**Risk:** **Overcharging or under-enforcing** limits vs contract.

---

## 8. “Connected” toggle (sidebar home)

If still present: **MOCK** UX — not real session state.

---

## Summary table

| Area | Primary class |
|------|----------------|
| Fiscal modules (TVA/IS/IR) | **MOCK** |
| Accounting journal | **MOCK** |
| Dashboard non-invoice KPIs | **MOCK** |
| AI outputs | **PARTIAL** (real tech, not legal truth) |
| PDF exports | **PARTIAL** (real files, not official filings) |
| Core CRM (clients/invoices) when DB OK | **PARTIAL → REAL** |

See **`REAL_VS_DEMO_MATRIX.md`** for module-by-module tags.
