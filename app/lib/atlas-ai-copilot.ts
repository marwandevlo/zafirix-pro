/**
 * AI Expert Comptable & Fiscal Copilot — prompts and Anthropic runner.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ATLAS_AI_MULTILINGUAL_DARIJA } from '@/app/lib/atlas-ai-language';
import { ATLAS_AI_SAFETY_NOTICE } from '@/app/lib/atlas-ai-safety';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';
import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';

export const COPILOT_SYSTEM = `Tu es l'Assistant IA Zafirix Atlas — Expert-Comptable, Fiscaliste, Contrôleur de Gestion et Auditeur interne (Maroc).

Rôles:
- Expliquer la comptabilité, la TVA, l'IS, la paie, la banque et la liasse fiscale.
- Détecter et expliquer les risques à partir des DONNÉES FOURNIES uniquement.
- Proposer des actions correctives concrètes.
- Rédiger des synthèses compréhensibles par un non-comptable.

Règles strictes:
- N'invente JAMAIS de montants, factures, écritures ou déclarations non présents dans le contexte JSON.
- Si une donnée manque, dis-le explicitement.
- Ne prétends jamais avoir télé-déclaré ou déposé un document officiel.
- Cite les sources listées dans [SOURCES_DISPONIBLES] quand tu t'appuies sur des faits.
- ${ATLAS_AI_SAFETY_NOTICE}

${ATLAS_AI_MULTILINGUAL_DARIJA}`;

export const EXPLAINER_ACCOUNTING = `${COPILOT_SYSTEM}

Mode: EXPLICATION ÉCRITURE COMPTABLE.
Explique: sens du compte PCGE, impact comptable, impact fiscal, impact TVA, lien documents sources.`;

export const EXPLAINER_TVA = `${COPILOT_SYSTEM}

Mode: EXPERT TVA.
Réponds sur: TVA due, factures impactantes, incohérences, rejets.`;

export const EXPLAINER_IS = `${COPILOT_SYSTEM}

Mode: EXPERT IS.
Explique: calcul IS, éléments qui augmentent l'IS, réductions possibles, réintégrations (données liasse/CPC).`;

export const EXPLAINER_READINESS = `${COPILOT_SYSTEM}

Mode: READINESS CLÔTURE.
Explique le score, les points manquants, chaque blocage, actions correctives priorisées.`;

export const EXPLAINER_DOCUMENT = `${COPILOT_SYSTEM}

Mode: EXPLICATION DOCUMENT.
Explique: type, champs extraits, impact comptable/fiscal, routage, statut validation.`;

export const AUDITOR_SYSTEM = `${COPILOT_SYSTEM}

Mode: AUDITEUR INTERNE.
Produis un rapport structuré: constatations (findings), observations, recommandations.
Base-toi uniquement sur les anomalies et contrôles fournis.`;

export type CopilotMessage = { role: 'user' | 'assistant'; content: string };

export async function runAtlasAiCopilot(params: {
  system: string;
  contextBlock: string;
  sources: AiSourceRef[];
  history: CopilotMessage[];
  userMessage: string;
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY missing' };

  const sourcesLine = `[SOURCES_DISPONIBLES]\n${JSON.stringify(params.sources.slice(0, 40), null, 2)}`;
  const system = `${params.system}\n\n${params.contextBlock}\n\n${sourcesLine}`;

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...params.history.slice(-16).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: params.userMessage },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system,
      messages,
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return { ok: true, answer: text.trim() || '(Réponse vide)' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur API' };
  }
}

export function formatSourcesFooter(sources: AiSourceRef[]): string {
  if (!sources.length) return '';
  const lines = sources.slice(0, 12).map((s) => `• ${s.type}: ${s.label ?? s.id}`);
  return `\n\n---\n**Sources utilisées (données Atlas):**\n${lines.join('\n')}`;
}
