/**
 * AI internal audit simulation — findings from anomalies + liasse controls.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef, AtlasAiAuditReport } from '@/app/types/atlas-ai-copilot';
import { detectAtlasAiAnomalies, persistAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';
import { runAtlasAiCopilot, AUDITOR_SYSTEM, EXPLAINER_READINESS, formatSourcesFooter } from '@/app/lib/atlas-ai-copilot';
import { buildAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';

export async function runAtlasAiAudit(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  companyProfile?: Record<string, unknown> | null,
  opts?: { useAiNarrative?: boolean },
): Promise<AtlasAiAuditReport> {
  const fiscalYear = new Date().getFullYear();
  const { anomalies: detected } = await detectAtlasAiAnomalies(db, userId, companyId);
  await persistAtlasAiAnomalies(db, userId, companyId, detected);

  const [liasse, { snapshot, sources }] = await Promise.all([
    runLiasseEngine(db, { userId, companyId, fiscalYear }),
    buildAtlasAiContext(db, { userId, companyId, companyProfile, fiscalYear }),
  ]);

  const findings = [
    ...detected.map((a) => ({
      severity: a.severity,
      category: a.category,
      title: a.title,
      description: a.description,
    })),
    ...liasse.checks.filter((c) => c.severity !== 'info').map((c) => ({
      severity: c.severity === 'critical' ? 'critical' as const : 'warning' as const,
      category: c.category,
      title: c.message.slice(0, 100),
      description: c.message,
    })),
  ].slice(0, 30);

  const observations: string[] = [
    `Score readiness clôture: ${liasse.readinessScore}%`,
    `Écritures analysées — journal ${liasse.payload.bilan ? 'avec bilan' : 'partiel'}`,
    `Banque: ${liasse.bankSummary.unreconciled_count} non rapprochée(s)`,
    `Paie: ${liasse.payrollSummary.payslips_validated}/${liasse.payrollSummary.payslips_total} bulletins validés`,
  ];

  const recommendations: string[] = liasse.blockingIssues.map((b) => b.message);
  if (recommendations.length === 0) {
    recommendations.push('Maintenir la validation mensuelle TVA et paie.', 'Documenter les écritures sans pièce.');
  }

  const auditSources: AiSourceRef[] = [
    ...sources,
    { type: 'liasse', id: `audit-${fiscalYear}`, label: 'Contrôles liasse' },
    { type: 'anomaly', id: 'scan', label: `${detected.length} anomalies` },
  ];

  if (opts?.useAiNarrative !== false) {
    const prompt = `Synthétise ce rapport d'audit interne en 3 observations et 3 recommandations prioritaires.\nAnomalies: ${JSON.stringify(detected.slice(0, 15))}`;
    const ai = await runAtlasAiCopilot({
      system: AUDITOR_SYSTEM,
      contextBlock: contextToPromptBlock(snapshot),
      sources: auditSources,
      history: [],
      userMessage: prompt,
    });
    if (ai.ok) {
      const lines = ai.answer.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        if (line.match(/recommand/i)) recommendations.push(line.replace(/^[-*]\s*/, ''));
        else if (line.match(/observ/i)) observations.push(line.replace(/^[-*]\s*/, ''));
      }
    }
  }

  return {
    exported_at: new Date().toISOString(),
    fiscal_year: fiscalYear,
    findings,
    observations: observations.slice(0, 10),
    recommendations: [...new Set(recommendations)].slice(0, 12),
    sources: auditSources,
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
  });

  const explanation = ai.ok
    ? `${ai.answer}${formatSourcesFooter(sources)}`
    : `${ruleExplanation}${formatSourcesFooter(sources)}`;

  return {
    score: liasse.readinessScore,
    explanation,
    sources,
    breakdown: liasse.readinessBreakdown,
  };
}
