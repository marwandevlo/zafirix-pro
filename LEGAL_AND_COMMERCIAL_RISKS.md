# ZAFIRIX PRO — Legal and commercial risks

**Disclaimer:** This is an engineering risk assessment, not legal advice. Engage qualified counsel in Morocco and any other relevant jurisdiction before commercial launch.

---

## High severity

### 1. AI-generated fiscal / juridique content

- **Risk:** Users treat model output as binding tax/legal advice; filing errors, penalties, disputes.  
- **Mitigation:** Persistent **BÊTA** labeling; in-product disclaimers; never claim official submission via app; log acknowledgment where feasible; restrict marketing language (“assistant” not “expert agréé”).

### 2. Client portal (`/client`)

- **Risk:** Demo PIN `1234` and static invoices/declarations imply a **working client portal** — misleading for B2B sales and unsafe if exposed.  
- **Mitigation:** Feature flag off in production; or implement magic-link auth + real data scoped to accountant’s tenant.

### 3. Subscription / billing drift

- **Risk:** User pays but UI shows free tier (or inverse) → chargebacks, regulatory complaints.  
- **Mitigation:** `SUBSCRIPTION_ARCHITECTURE_PLAN.md`; webhook monitoring; clear support runbook.

### 4. Data residency & privacy

- **Risk:** Financial and HR data in Supabase; AI calls to Anthropic may transmit snippets.  
- **Mitigation:** Privacy policy + DPA with vendors; data processing agreement; minimize PII in prompts; retention limits.

---

## Medium severity

### 5. Misleading KPIs or “health” scores

- If any dashboard implies compliance status, **risk** of false sense of security.  
- **Mitigation:** Neutral copy (“indicatif”), cite data sources, avoid red/green “compliant” unless rule-based from user-confirmed filings.

### 6. Manual payment flows

- **Risk:** Social engineering if payment instructions can be spoofed.  
- **Mitigation:** Instructions only from authenticated in-app source; educate users; audit admin actions.

### 7. Referral program

- **Risk:** Fraudulent referrals if validation weak.  
- **Mitigation:** Rate limits (partially present); server-side eligibility rules; fraud review.

---

## Low / operational

### 8. Terms & privacy pages

- Keep versioned; track last-updated date; match actual product behavior (AI, analytics cookies).

### 9. Export / reporting

- Any “official” export naming (e.g. “Déclaration TVA”) must match regulatory reality or be renamed.

---

## Action table

| Risk | Product response |
|------|------------------|
| AI advice | BETA + disclaimers + human review CTA |
| Demo client portal | Hide / rebuild |
| Billing drift | Single source of truth + monitoring |
| PII to AI | Minimize + policy + opt-out where required |

---

## References

- `AI_FEATURES_STATUS.md`  
- `REAL_VS_FAKE_MATRIX.md`  
- `app/terms/page.tsx`, `app/privacy/page.tsx`
