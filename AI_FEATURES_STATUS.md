# ZAFIRIX PRO — AI features status

**Routes:** primarily `app/api/ai/route.ts` (Anthropic), plus `app/api/whisper/route.ts`, `app/api/tts/route.ts`.  
**Client surfaces:** `app/consultant/page.tsx`, `app/juridique/page.tsx`, assistant overlay, documents flows that invoke OCR-style prompts.

---

## Classification summary

| Capability | Status | Production? |
|------------|--------|-------------|
| Consultant fiscal chat | **BETA** | Allowed with disclaimers + auth + rate limits |
| Juridique / actes assistance | **BETA** | Same; never imply legally binding output |
| OCR JSON extraction via AI | **BETA** | No dedicated OCR engine; quality variable |
| “Assistant” JSON actions | **BETA** | Actions are suggest-only; `requiresConfirmation` must stay enforced in UI |
| Whisper STT | **BETA** | Operational cost + abuse surface |
| TTS | **BETA** | Same |

---

## What is “real” today

- **Anthropic** SDK with server-side API key (`ANTHROPIC_API_KEY`).  
- **`authenticateAiRequest`** — session/bearer auth path (per prior stabilization).  
- **`checkAiRateLimit`** — partial protection.  
- **Safety copy** in `ATLAS_AI_SAFETY_NOTICE` and system prompts (legal disclaimer).  
- **UI:** Consultant subtitle should state **Bêta** and human verification (verify in repo).

---

## What is missing for “GA / non-beta”

1. **Storage:** long-term chat logs, consent, and retention policy (GDPR-style).  
2. **Queues / async jobs:** large documents should not block HTTP request indefinitely.  
3. **Retries / idempotency:** paid-tier reliability.  
4. **Observability:** token usage metrics, cost per tenant, tracing.  
5. **Billing / quotas:** enforce plan limits server-side (not only UI).  
6. **Content safety:** moderation hook / blocklists for PII exfil patterns.  
7. **Grounding:** RAG from user’s own Supabase rows optional — until then outputs are **not** grounded in live tenant data unless explicitly injected in prompt construction.

---

## Policy

- Do **not** market AI as “expert-comptable certifié” or official filing.  
- All AI-driven outputs remain **informational**; human professional review required.  
- If `ANTHROPIC_API_KEY` missing, return clear **503** with no fake assistant text.

---

## References

- `app/api/ai/route.ts`  
- `app/lib/ai-auth-server.ts`, `app/lib/ai-rate-limit.ts`, `app/lib/atlas-ai-safety.ts`  
- `LEGAL_AND_COMMERCIAL_RISKS.md`
