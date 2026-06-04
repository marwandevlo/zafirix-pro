/**
 * Phase 13C — Fiscal Closing Assistant (enhanced checklist + blockers).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';
import { ATLAS_AI_READINESS_THRESHOLD } from '@/app/lib/atlas-ai-constants';
import { detectAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';

export type ClosingAssistantResult = {
  ready: boolean;
  score: number;
  blockingIssues: string[];
  recommendations: string[];
  estimatedReadiness: number;
  checklist: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
    href?: string;
  }>;
  sources: AiSourceRef[];
};

export async function evaluateFiscalClosing(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  fiscalYear?: number,
): Promise<ClosingAssistantResult> {
  const fy = fiscalYear ?? new Date().getFullYear();
  const today = new Date().toISOString().split('T')[0];

  const [engine, { anomalies }, liasseRow, legalRes, cnssRes] = await Promise.all([
    runLiasseEngine(db, { userId, companyId, fiscalYear: fy }),
    detectAtlasAiAnomalies(db, userId, companyId),
    db.from('zafirix_liasse_fiscale').select('id, status').eq('user_id', userId).eq('fiscal_year', fy).maybeSingle(),
    db.from('zafirix_legal_documents').select('id').eq('user_id', userId).lt('expiry_date', today).limit(1),
    db.from('atlas_payroll_runs').select('id, status').eq('user_id', userId).eq('period_year', fy).limit(10),
  ]);

  const tvaOk = !engine.checks.some((c) => c.category === 'TVA' && c.severity === 'critical')
    && !anomalies.some((a) => a.code === 'tva-inconsistency');
  const payrollOk = engine.payrollSummary.payslips_draft === 0
    && !anomalies.some((a) => a.code === 'payroll-anomaly');
  const cnssOk = (cnssRes.data ?? []).some((r) => r.status === 'validated')
    || engine.payrollSummary.payslips_total === 0;
  const bankOk = engine.bankSummary.unreconciled_count === 0
    && !anomalies.some((a) => a.code === 'bank-unreconciled');
  const liasseOk = !!liasseRow.data && liasseRow.data.status !== 'draft';
  const legalOk = (legalRes.data ?? []).length === 0
    && !anomalies.some((a) => a.code === 'legal-expired');
  const criticalAnomaliesOk = anomalies.filter((a) => a.severity === 'critical').length === 0;

  const checklist = [
    { id: 'tva', label: 'TVA validée', ok: tvaOk, href: '/tva', detail: tvaOk ? 'OK' : 'Incohérences ou rejets TVA' },
    { id: 'payroll', label: 'Paie validée', ok: payrollOk, href: '/rh', detail: `${engine.payrollSummary.payslips_validated}/${engine.payrollSummary.payslips_total} bulletins` },
    { id: 'cnss', label: 'CNSS complète', ok: cnssOk, href: '/rh', detail: cnssOk ? 'Runs paie OK' : 'CNSS / runs incomplets' },
    { id: 'bank', label: 'Banque rapprochée', ok: bankOk, href: '/banque', detail: `${engine.bankSummary.unreconciled_count} non rapprochée(s)` },
    { id: 'liasse', label: 'Liasse générée', ok: liasseOk, href: '/liasse', detail: liasseRow.data ? `Statut: ${liasseRow.data.status}` : 'Non générée' },
    { id: 'legal', label: 'Alertes juridiques résolues', ok: legalOk, href: '/juridique', detail: legalOk ? 'OK' : 'Contrats expirés' },
    { id: 'anomalies', label: 'Anomalies critiques résolues', ok: criticalAnomaliesOk, href: '/assistant', detail: criticalAnomaliesOk ? 'OK' : `${anomalies.filter((a) => a.severity === 'critical').length} critique(s)` },
  ];

  const blockingIssues = [
    ...engine.blockingIssues.map((b) => b.message),
    ...anomalies.filter((a) => a.severity === 'critical').map((a) => a.title),
    ...checklist.filter((c) => !c.ok).map((c) => c.detail ?? c.label),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const recommendations = blockingIssues.map((b) => `Corriger: ${b}`);
  if (recommendations.length === 0) {
    recommendations.push('Planifier la clôture avec votre expert-comptable.', 'Archiver les pièces justificatives.');
  }

  const checklistScore = Math.round((checklist.filter((c) => c.ok).length / checklist.length) * 100);
  const score = Math.round((engine.readinessScore + checklistScore) / 2);
  const ready = checklist.every((c) => c.ok) && blockingIssues.length === 0 && score >= ATLAS_AI_READINESS_THRESHOLD;

  const sources: AiSourceRef[] = [
    { type: 'readiness', id: `closing-${fy}`, label: `Score ${score}%` },
    { type: 'liasse', id: String(fy), label: 'Liasse engine' },
    { type: 'anomaly', id: 'closing', label: `${anomalies.length} anomalies` },
  ];

  return {
    ready,
    score,
    blockingIssues,
    recommendations: recommendations.slice(0, 12),
    estimatedReadiness: engine.readinessScore,
    checklist,
    sources,
  };
}
