/**
 * AI internal audit — delegates to Phase 13C auditor engine.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef, AtlasAiAuditReport } from '@/app/types/atlas-ai-copilot';
import { runAtlasAiAuditor, type AtlasAiAuditorReport } from '@/app/lib/atlas-ai-auditor';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';
import { runAtlasAiCopilot, EXPLAINER_READINESS, formatSourcesFooter } from '@/app/lib/atlas-ai-copilot';
import { buildAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';

export async function runAtlasAiAudit(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  companyProfile?: Record<string, unknown> | null,
  opts?: { useAiNarrative?: boolean; fiscalYear?: number },
): Promise<AtlasAiAuditReport & { score?: number; criticalIssues?: AtlasAiAuditorReport['criticalIssues']; sections?: AtlasAiAuditorReport['sections'] }> {
  const report = await runAtlasAiAuditor(db, userId, companyId, {
    fiscalYear: opts?.fiscalYear,
    useAiNarrative: opts?.useAiNarrative,
  });

  return {
    exported_at: report.exported_at,
    fiscal_year: report.fiscal_year,
    findings: report.findings,
    observations: report.observations,
    recommendations: report.recommendations,
    sources: report.sources,
    score: report.score,
    criticalIssues: report.criticalIssues,
    sections: report.sections,
  };
}

export async function explainReadiness(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  companyProfile?: Record<string, unknown> | null,
): Promise<{ score: number; explanation: string; sources: AiSourceRef[]; breakdown: Record<string, number> }> {
  const fiscalYear = new Date().getFullYear();
  const liasse = await runLiasseEngine(db, { userId, companyId, fiscalYear });
  const { snapshot, sources } = await buildAtlasAiContext(db, { userId, companyId, companyProfile, fiscalYear });

  const missing = 100 - liasse.readinessScore;
  const ruleExplanation = [
    `Score actuel: ${liasse.readinessScore}% (${missing} points manquants).`,
    ...Object.entries(liasse.readinessBreakdown).map(([k, v]) => `• ${k}: +${v} pts`),
    ...liasse.blockingIssues.map((b) => `⚠ ${b.message}`),
  ].join('\n');

  const ai = await runAtlasAiCopilot({
    system: EXPLAINER_READINESS,
    contextBlock: contextToPromptBlock(snapshot),
    sources,
    history: [],
    userMessage: `Explique pourquoi la readiness est à ${liasse.readinessScore}% et quelles actions correctives prioriser.`,
    ruleBasedFallback: () => ruleExplanation,
  });

  const explanation = `${ai.answer}${formatSourcesFooter(sources)}`;

  return {
    score: liasse.readinessScore,
    explanation,
    sources,
    breakdown: liasse.readinessBreakdown,
  };
}
