/**
 * AI Expert Comptable & Fiscal Copilot — prompts and provider-backed runner.
 */

import { ATLAS_AI_MULTILINGUAL_DARIJA } from '@/app/lib/atlas-ai-language';
import { ATLAS_AI_SAFETY_NOTICE } from '@/app/lib/atlas-ai-safety';
import { runAtlasAiWithFallback, streamAtlasAiWithFallback } from '@/app/lib/atlas-ai-provider';
import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';

export const COPILOT_SYSTEM = `Tu es l'Assistant IA Zafirix Atlas — Expert-Comptable, Fiscaliste, Contrôleur de Gestion et Auditeur interne (Maroc).

Rôles:
- Expliquer la comptabilité, la TVA, l'IS, la paie, la banque et la liasse fiscale.
- Détecter et expliquer les risques à partir des DONNÉES FOURNIES uniquement.
- Proposer des actions correctives concrètes.
- Rédiger des synthèses compréhensibles par un non-comptable.

Règles strictes:
- N'invente JAMAIS de montants, factures, écritures ou déclarations non présents dans le contexte JSON.
- Si une donnée manque, réponds: « Information non disponible dans Atlas. »
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
  ruleBasedFallback?: () => string;
}): Promise<{ answer: string; provider: string }> {
  const sourcesLine = `[SOURCES_DISPONIBLES]\n${JSON.stringify(params.sources.slice(0, 40), null, 2)}`;
  const result = await runAtlasAiWithFallback({
    system: params.system,
    contextBlock: params.contextBlock,
    sourcesLine,
    history: params.history,
    userMessage: params.userMessage,
    ruleBasedFallback: params.ruleBasedFallback,
  });
  return { answer: result.answer.trim() || '(Réponse vide)', provider: result.provider };
}

export async function* streamAtlasAiCopilot(params: {
  system: string;
  contextBlock: string;
  sources: AiSourceRef[];
  history: CopilotMessage[];
  userMessage: string;
  ruleBasedFallback?: () => string;
}): AsyncGenerator<string> {
  const sourcesLine = `[SOURCES_DISPONIBLES]\n${JSON.stringify(params.sources.slice(0, 40), null, 2)}`;
  yield* streamAtlasAiWithFallback({
    system: params.system,
    contextBlock: params.contextBlock,
    sourcesLine,
    history: params.history,
    userMessage: params.userMessage,
    ruleBasedFallback: params.ruleBasedFallback,
  });
}

export function formatSourcesFooter(sources: AiSourceRef[]): string {
  if (!sources.length) return '';
  const lines = sources.slice(0, 12).map((s) => `• ${s.type}: ${s.label ?? s.id}`);
  return `\n\n---\n**Sources utilisées (données Atlas):**\n${lines.join('\n')}`;
}
