/**
 * Phase 13A — Daily AI insights from anomaly engine + audit logging.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef, AtlasAiInsight, AtlasAiRecommendation } from '@/app/types/atlas-ai-copilot';
import { ATLAS_AI_READINESS_THRESHOLD } from '@/app/lib/atlas-ai-constants';
import {
  detectAtlasAiAnomalies,
  persistAtlasAiAnomalies,
  type DetectedAnomaly,
} from '@/app/lib/atlas-ai-anomalies';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';

export type GenerateInsightsResult = {
  insights: AtlasAiInsight[];
  recommendations: AtlasAiRecommendation[];
  anomalies: DetectedAnomaly[];
  readinessScore: number;
  interactionId: string | null;
};

function anomalyToInsight(a: DetectedAnomaly): AtlasAiInsight {
  const kind =
    a.severity === 'critical' ? 'risk'
      : a.code === 'liasse-readiness-low' ? 'fiscal_warning'
        : a.code === 'bank-unreconciled' ? 'cash_flow'
          : 'recommendation';

  return {
    id: `insight-${a.code}`,
    kind,
    title: a.title,
    description: a.description,
    severity: a.severity,
    href: a.href,
  };
}

function anomalyToRecommendation(a: DetectedAnomaly): AtlasAiRecommendation | null {
  const priority = a.severity === 'critical' ? 'high' : a.severity === 'warning' ? 'medium' : 'low';
  if (a.code === 'tva-inconsistency') {
    return { id: 'rec-tva', message: 'Corrigez les incohérences TVA avant clôture.', priority, href: '/tva' };
  }
  if (a.code === 'bank-unreconciled') {
    const n = (a.details?.unreconciled_count as number) ?? 0;
    return { id: 'rec-bank', message: `${n} opération(s) bancaire(s) à rapprocher.`, priority: 'high', href: '/banque' };
  }
  if (a.code === 'payroll-anomaly') {
    return { id: 'rec-payroll', message: 'Validez les bulletins et vérifiez les données CNSS.', priority, href: '/rh' };
  }
  if (a.code === 'liasse-readiness-low') {
    return {
      id: 'rec-readiness',
      message: `Readiness fiscale ${a.details?.readiness_score ?? '—'}% — seuil ${ATLAS_AI_READINESS_THRESHOLD}%.`,
      priority: 'high',
      href: '/liasse',
    };
  }
  if (a.code === 'validation-rejected') {
    const n = (a.details?.count as number) ?? 0;
    return { id: 'rec-rejected', message: `${n} enregistrement(s) rejeté(s) à traiter.`, priority: 'high', href: '/validation' };
  }
  if (a.code === 'legal-expired') {
    const n = (a.details?.count as number) ?? 0;
    return { id: 'rec-legal', message: `${n} document(s) juridique(s) expiré(s) — renouveler ou archiver.`, priority: 'high', href: '/juridique' };
  }
  return null;
}

export async function generateAtlasAiInsights(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
): Promise<GenerateInsightsResult> {
  const { anomalies: detected, readinessScore } = await detectAtlasAiAnomalies(db, userId, companyId);
  await persistAtlasAiAnomalies(db, userId, companyId, detected);

  const insights: AtlasAiInsight[] = detected.map(anomalyToInsight);
  const recommendations: AtlasAiRecommendation[] = detected
    .map(anomalyToRecommendation)
    .filter((r): r is AtlasAiRecommendation => r != null);

  if (insights.length === 0) {
    insights.push({
      id: 'all-clear',
      kind: 'opportunity',
      title: 'Situation stable',
      description: `Aucune anomalie Phase 13A détectée. Readiness: ${readinessScore}%.`,
      severity: 'info',
      href: '/liasse',
    });
  }

  const sources: AiSourceRef[] = detected.map((a) => ({
    type: a.code === 'tva-inconsistency' ? 'tva'
      : a.code === 'bank-unreconciled' ? 'bank'
        : a.code === 'payroll-anomaly' ? 'payroll'
          : a.code === 'liasse-readiness-low' ? 'readiness'
            : a.code === 'legal-expired' ? 'legal'
              : 'anomaly',
    id: a.code,
    label: a.title,
  }));

  let interactionId: string | null = null;
  try {
    interactionId = await logAtlasAiInteraction(db, {
      userId,
      companyId,
      interactionType: 'insight',
      prompt: 'generate_daily_insights',
      answer: JSON.stringify({
        insight_count: insights.length,
        recommendation_count: recommendations.length,
        anomaly_count: detected.length,
        readiness_score: readinessScore,
      }),
      sourcesUsed: sources,
      metadata: {
        insights: insights.map((i) => ({ id: i.id, title: i.title, severity: i.severity })),
        recommendations: recommendations.map((r) => ({ id: r.id, message: r.message })),
        anomaly_codes: detected.map((a) => a.code),
      },
    });
  } catch {
    interactionId = null;
  }

  return {
    insights,
    recommendations,
    anomalies: detected,
    readinessScore,
    interactionId,
  };
}
