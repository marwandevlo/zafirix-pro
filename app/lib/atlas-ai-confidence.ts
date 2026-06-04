/**
 * Phase 13B — confidence scoring for grounded copilot answers.
 */

import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';

export const ATLAS_AI_DATA_UNAVAILABLE = 'Information non disponible dans Atlas.';

export function computeCopilotConfidence(params: {
  sources: AiSourceRef[];
  hasAnswer: boolean;
  contextLoaded?: boolean;
  subjectLoaded?: boolean;
}): number {
  if (!params.hasAnswer) return 0;
  let score = 0.55;
  if (params.contextLoaded !== false) score += 0.15;
  if (params.subjectLoaded !== false) score += 0.1;
  score += Math.min(params.sources.length * 0.025, 0.2);
  return Math.min(Math.round(score * 100) / 100, 0.99);
}
