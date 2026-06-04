/**
 * Phase 17 — AI copilot onboarding prompt block.
 */

import { KNOWLEDGE_ARTICLES } from '@/app/lib/atlas-knowledge-base';

const ONBOARDING_QUESTIONS = [
  'Comment créer ma première facture ?',
  'Comment configurer la TVA ?',
  'Comment générer une liasse ?',
  'Comment importer un relevé bancaire ?',
  'Comment lancer la paie ?',
];

export function buildOnboardingAiPromptBlock(): string {
  const snippets = KNOWLEDGE_ARTICLES.filter((a) =>
    ['first-invoice', 'configure-tva', 'generate-liasse', 'bank-import', 'payroll-setup'].includes(a.id),
  )
    .map((a) => `- ${a.titleFr}: ${a.summaryFr}`)
    .join('\n');

  return `[ONBOARDING GUIDE — répondez avec des étapes numérotées et liens internes]
Questions fréquentes: ${ONBOARDING_QUESTIONS.join(' | ')}
Articles:
${snippets}
Si l'utilisateur demande comment démarrer, orientez vers /setup puis /documents.`;
}

export function isOnboardingQuestion(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('première facture') ||
    m.includes('first invoice') ||
    m.includes('configurer la tva') ||
    m.includes('configure tva') ||
    m.includes('générer une liasse') ||
    m.includes('generate liasse') ||
    m.includes('comment démarrer') ||
    m.includes('getting started') ||
    m.includes('premiers pas')
  );
}
