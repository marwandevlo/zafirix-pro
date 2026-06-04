# Phase 19 — Support Playbook

**Date:** 2026-06-04

---

## Channels

| Channel | Use |
|---------|-----|
| In-app Feedback widget | Satisfaction, bugs, features |
| `/help` knowledge base | Self-service |
| Email support@zafirix.pro | Escalations |
| Admin `/admin/users` | Account lookup |

---

## FAQ process

1. Identify recurring question (≥3 tickets/week)
2. Add article to `atlas-knowledge-base.ts` + `/help`
3. Add user doc under `docs/user/` if procedural
4. Link from smart recommendations if onboarding-related

---

## Bug handling

| Severity | SLA response | SLA resolution |
|----------|--------------|----------------|
| Critical | 4h | 24h |
| High | 1 business day | 3 days |
| Medium | 2 business days | Sprint |
| Low | Best effort | Backlog |

Log in `docs/PHASE18_BUG_REGISTRY.md` or issue tracker. Feedback API → `events` table.

---

## Escalation workflow

```
User → L1 Support → L2 Engineering → L3 Product/Legal
```

Escalate to engineering if: data loss, security, billing error, multi-tenant leakage.

---

## SLA definitions (GA)

| Tier | Support hours | Response |
|------|---------------|----------|
| Free/Trial | Business hours | 48h |
| Starter/Pro | Business hours | 24h |
| Cabinet/Enterprise | Extended | 8h |

*SLAs indicative — formalize in enterprise contracts.*

---

## Known workarounds

| Issue | Workaround |
|-------|------------|
| Onboarding progress lost on new device | Re-run `/setup`; events logged server-side |
| Assistant overlay hidden | Use `/assistant` directly |

**Verdict:** Support playbook **ready for GA** launch.
