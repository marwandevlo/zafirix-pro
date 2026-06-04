/**
 * Phase 14 — Company health score engine (0–100).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyHealthResult, HealthBand } from '@/app/types/atlas-workspace';
import { detectAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';

function bandFromScore(score: number): HealthBand {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'attention';
  return 'critical';
}

export async function computeCompanyHealth(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
): Promise<CompanyHealthResult> {
  const fiscalYear = new Date().getFullYear();

  const rejectedQ = db.from('zafirix_routing_records').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('validation_status', 'rejected');
  if (companyId) rejectedQ.eq('company_id', companyId);

  const tvaQ = db.from('zafirix_tva_suggestions').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('validation_status', 'rejected');
  if (companyId) tvaQ.eq('company_id', companyId);

  const [liasse, { anomalies }, rejectedRes, tvaRes] = await Promise.all([
    runLiasseEngine(db, { userId, companyId, fiscalYear }),
    detectAtlasAiAnomalies(db, userId, companyId),
    rejectedQ,
    tvaQ,
  ]);

  const readinessScore = liasse.readinessScore;
  const alertCount = anomalies.length;
  const validationBacklog = (rejectedRes.count ?? 0) + liasse.payrollSummary.payslips_draft;
  const unreconciledBank = liasse.bankSummary.unreconciled_count;
  const tvaIssues = anomalies.filter((a) => a.code === 'tva-inconsistency').length + (tvaRes.count ?? 0);
  const payrollIssues = anomalies.filter((a) => a.code === 'payroll-anomaly').length + liasse.payrollSummary.payslips_draft;

  let score = readinessScore;
  score -= Math.min(alertCount * 3, 25);
  score -= Math.min(validationBacklog * 2, 15);
  score -= Math.min(unreconciledBank * 2, 15);
  score -= Math.min(tvaIssues * 4, 20);
  score -= Math.min(payrollIssues * 3, 15);
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    companyId: companyId ?? '',
    score,
    band: bandFromScore(score),
    readinessScore,
    alertCount,
    validationBacklog,
    unreconciledBank,
    tvaIssues,
    payrollIssues,
    factors: {
      readiness: readinessScore,
      alerts: alertCount,
      validation: validationBacklog,
      bank: unreconciledBank,
      tva: tvaIssues,
      payroll: payrollIssues,
    },
  };
}

export function healthBandLabel(band: HealthBand): string {
  switch (band) {
    case 'healthy': return 'Healthy';
    case 'attention': return 'Attention';
    case 'critical': return 'Critical';
  }
}

export function healthBandLabelFr(band: HealthBand): string {
  switch (band) {
    case 'healthy': return 'Sain';
    case 'attention': return 'Attention';
    case 'critical': return 'Critique';
  }
}
