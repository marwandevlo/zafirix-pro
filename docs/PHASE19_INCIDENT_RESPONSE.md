# Phase 19 — Incident Response Playbook

**Date:** 2026-06-04  
**Owner:** Platform / On-call

---

## Severity levels

| Level | Definition | Response time | Example |
|-------|------------|---------------|---------|
| **SEV-1** | Total outage or data breach | 15 min | Auth down, DB unreachable |
| **SEV-2** | Major feature broken | 1 hour | OCR down, billing incorrect |
| **SEV-3** | Partial degradation | 4 hours | Slow AI, single module error |
| **SEV-4** | Minor / cosmetic | Next business day | UI glitch, doc typo |

---

## Escalation path

1. **L1** — On-call engineer (monitoring alert / user report)
2. **L2** — Lead engineer + product owner
3. **L3** — Executive + legal (SEV-1 breach or regulatory)

Contacts: `#incidents` channel, support@zafirix.pro

---

## Recovery procedures

### SEV-1 — Platform down

1. Check `/api/health/dependencies`
2. Verify Vercel status + Supabase status
3. Roll back last deploy if regression confirmed
4. Post status update (template below)
5. Post-mortem within 48h

### SEV-2 — AI / OCR failure

1. Check provider status (Anthropic/OpenAI)
2. Review rate limits and quota tables
3. Enable graceful error messages (already in copilot)
4. Metering prevents cost runaway

### SEV-2 — Billing incorrect

1. Freeze plan changes
2. Query `atlas_usage_events` and subscriptions
3. Manual correction via admin billing tools
4. Notify affected workspaces

### Data breach suspected

1. Revoke compromised keys immediately
2. Preserve logs (`events`, Sentry)
3. Notify DPO / legal within 24h
4. CNDP notification if required (Morocco)

---

## Communication templates

**Initial (SEV-1):**
> Nous investiguons une interruption de service affectant Zafirix Atlas. Mise à jour dans 30 minutes. Réf: INC-{id}

**Resolved:**
> L'incident INC-{id} est résolu. Durée: {duration}. Cause: {summary}. Mesures préventives: {actions}.

**Maintenance:**
> Maintenance planifiée le {date} de {start} à {end} UTC. Impact: {scope}.

---

## Post-incident

- [ ] Timeline documented
- [ ] Root cause identified
- [ ] Fix deployed
- [ ] Monitoring improved
- [ ] Customer comms if needed
