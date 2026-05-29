# ZAFIRIX PRO — Payment & Legal Risks

**Audience:** Founder, counsel, DPO, payment ops.

---

## A. Payment risks

### A1. Dual rails (Paddle + manual Morocco)

**Risk:** Double activation, wrong plan, manual fraud, support load.

**Mitigation:** Single **state machine** per user; admin actions **idempotent**; **receipt** artifacts stored immutably.

### A2. Paddle not fully wired

Checkout route returns **501** when `PADDLE_*` env incomplete (`app/api/paddle/checkout/route.ts`).

**Risk:** Customer pays elsewhere / confusion / chargebacks.

### A3. Webhook = financial truth (partial implementation)

Only a subset of Paddle events handled.

**Risk:** **Silent desync** between Paddle and DB.

**Mitigation:** Webhook event store + nightly reconciliation against Paddle API.

### A4. Consumer protection (Morocco / EU cards)

**Risk:** Refund policy, cooling-off, VAT on SaaS, invoice requirements — **not enforced in code** (product/legal).

---

## B. Tax & accounting legal risks

### B1. TVA / IS / IR UI implies compliance

**Reality:** Demo calculations and fake XML.

**Legal risk:** **Misleading commercial practices** (Morocco Law 31-08 consumer protection); **taxpayer liability** if users file wrong data.

**Required:** Clear **“simulation only”**; no DGI logos; no “télédeclaration” claim without certification.

### B2. Accounting module

**Risk:** Users submit **comptabilité** exports to banks or auditors as truth.

**Mitigation:** Watermark “NON AUDITÉ / BROUILLON”.

---

## C. Labor & HR legal risks

Generated **contracts / HR documents** via AI + templates.

**Risks:**

- Wrong mandatory clauses (Morocco Labor Code).  
- Missing bilingual requirements where needed.  
- Discrimination / unlawful termination language if user prompts steer model.

**Mitigation:** **Human-in-the-loop** for HR; versioned templates by **qualified counsel**; user attestation checkbox.

---

## D. Corporate / legal module risks

RC / statutes / modifications as **.docx** from app.

**Risks:** Formalistic errors; wrong greffe format; missing annexes.

**Mitigation:** Position as **draft** only; partner with **avocat** or **formaliste** workflow.

---

## E. Data protection (GDPR / Morocco Law 09-08)

**Risks:**

- localStorage fallback → data **off** primary DB.  
- AI prompts may contain PII → **sub-processor** agreements (Anthropic, etc.).  
- No documented retention in repo.

**Mitigation:** DPA, privacy policy, subprocessors page, data export/delete runbooks.

---

## F. AI-specific legal / contractual

- Output **not** professional advice (must be **prominent** in UI, not only system prompt).  
- **Bias / hallucination** liability allocation in **ToS**.  
- **Logging** of prompts: legal vs product decision (minimize PII in logs).

---

## G. Admin access

Owner email bypass + service role = **high trust**.

**Risks:** Insider abuse; credential leak.

**Mitigation:** MFA for admin; break-glass procedure; audit log.

---

## Summary risk heatmap

| Area | Severity |
|------|----------|
| Fake fiscal / filing UX | **Critical** (commercial + user harm) |
| localStorage data split | **Critical** (integrity + privacy) |
| AI auth off by default | **High** |
| Paddle partial integration | **High** until closed |
| HR/Legal AI drafts | **High** (professional liability) |
