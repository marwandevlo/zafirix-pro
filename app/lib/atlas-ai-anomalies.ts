/**
 * Phase 13A — Rule-based anomaly detection (insights feed).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiAnomalySeverity, AtlasAiAnomaly } from '@/app/types/atlas-ai-copilot';
import { isMissingTableError } from '@/app/lib/atlas-api-company-guard';
import { ATLAS_AI_READINESS_THRESHOLD, ATLAS_AI_TVA_TOLERANCE_PCT } from '@/app/lib/atlas-ai-constants';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';

export type AnomalyCode =
  | 'tva-inconsistency'
  | 'bank-unreconciled'
  | 'payroll-anomaly'
  | 'liasse-readiness-low'
  | 'validation-rejected'
  | 'legal-expired';

export type DetectedAnomaly = {
  code: AnomalyCode | string;
  category: string;
  severity: AiAnomalySeverity;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  href?: string;
};

export type DetectAnomaliesResult = {
  anomalies: DetectedAnomaly[];
  readinessScore: number;
};

function filterCo<T extends { company_id?: string | null }>(
  rows: T[] | null | undefined,
  companyId: string | null,
): T[] {
  if (!companyId) return rows ?? [];
  return (rows ?? []).filter((r) => !r.company_id || r.company_id === companyId);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pushUnique(
  list: DetectedAnomaly[],
  seen: Set<string>,
  anomaly: DetectedAnomaly,
): void {
  if (seen.has(anomaly.code)) return;
  seen.add(anomaly.code);
  list.push(anomaly);
}

export async function detectAtlasAiAnomalies(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
): Promise<DetectAnomaliesResult> {
  const fiscalYear = new Date().getFullYear();
  const anomalies: DetectedAnomaly[] = [];
  const seen = new Set<string>();

  const today = new Date().toISOString().split('T')[0];

  const [reconRes, payslipsRes, tvaRes, rejectedRes, legalRes, liasse] = await Promise.all([
    db.from('atlas_bank_reconciliation').select('transaction_id, status, company_id').eq('user_id', userId),
    db.from('atlas_payslip_extractions').select('id, employee_name, gross_salary, period_year, period_month, validation_status, cnss_amount, company_id').eq('user_id', userId),
    db.from('zafirix_tva_suggestions').select('id, amount_ht, vat_rate, vat_amount, validation_status, metadata, company_id').eq('user_id', userId),
    db.from('zafirix_routing_records').select('id, target_module, source_document_id, updated_at, company_id').eq('user_id', userId).eq('validation_status', 'rejected').order('updated_at', { ascending: false }).limit(20),
    db.from('zafirix_legal_documents').select('id, title, expiry_date, company_id').eq('user_id', userId).lt('expiry_date', today).order('expiry_date', { ascending: false }).limit(20),
    runLiasseEngine(db, { userId, companyId, fiscalYear }),
  ]);

  const recons = filterCo(reconRes.data, companyId);
  const payslips = filterCo(payslipsRes.data, companyId);
  const tvaRows = filterCo(tvaRes.data, companyId);
  const rejected = filterCo(rejectedRes.data, companyId);
  const expiredLegal = filterCo(legalRes.data, companyId);

  // TVA inconsistencies
  let tvaIssueCount = 0;
  for (const tva of tvaRows) {
    const meta = (tva.metadata && typeof tva.metadata === 'object') ? tva.metadata as Record<string, unknown> : {};
    const ht = Number(tva.amount_ht ?? meta.amount_ht ?? 0);
    const rate = Number(tva.vat_rate ?? meta.vat_rate ?? 20);
    const detected = Number(tva.vat_amount ?? meta.vat_amount ?? 0);
    const expected = ht * (rate / 100);
    if (ht > 0 && Math.abs(expected - detected) > expected * ATLAS_AI_TVA_TOLERANCE_PCT + 0.5) {
      tvaIssueCount++;
      if (tvaIssueCount === 1) {
        pushUnique(anomalies, seen, {
          code: 'tva-inconsistency',
          category: 'TVA',
          severity: 'critical',
          title: 'Incohérences TVA détectées',
          description: `Écart TVA: attendu ${round2(expected)} MAD, détecté ${round2(detected)} MAD (exemple)`,
          entityType: 'tva',
          entityId: String(tva.id),
          href: '/tva',
          details: { ht, rate, expected, detected },
        });
      }
    }
  }
  if (tvaIssueCount > 1) {
    const existing = anomalies.find((a) => a.code === 'tva-inconsistency');
    if (existing) {
      existing.description = `${tvaIssueCount} incohérence(s) TVA détectée(s)`;
      existing.details = { ...existing.details, count: tvaIssueCount };
    }
  }

  // Unreconciled bank transactions
  const unmatched = recons.filter((r) => r.status === 'unmatched').length;
  if (unmatched > 0) {
    pushUnique(anomalies, seen, {
      code: 'bank-unreconciled',
      category: 'Banque',
      severity: 'critical',
      title: 'Transactions bancaires non rapprochées',
      description: `${unmatched} opération(s) non rapprochée(s)`,
      href: '/banque',
      details: { unreconciled_count: unmatched },
    });
  }

  // Payroll anomalies
  const payslipKeys = new Set<string>();
  let payrollIssues = 0;
  for (const p of payslips) {
    const key = `${p.employee_name}|${p.period_year}|${p.period_month}`;
    if (payslipKeys.has(key)) payrollIssues++;
    payslipKeys.add(key);
    if (p.validation_status === 'draft') payrollIssues++;
    if (Number(p.gross_salary ?? 0) > 0 && Number(p.cnss_amount ?? 0) === 0) payrollIssues++;
  }
  if (liasse.payrollSummary.payslips_draft > 0) payrollIssues++;
  if (payrollIssues > 0) {
    pushUnique(anomalies, seen, {
      code: 'payroll-anomaly',
      category: 'Paie',
      severity: payrollIssues > 2 ? 'critical' : 'warning',
      title: 'Anomalies paie / CNSS',
      description: `${liasse.payrollSummary.payslips_draft} bulletin(s) brouillon, ${payrollIssues} signal(s) paie`,
      href: '/rh',
      details: {
        payslips_draft: liasse.payrollSummary.payslips_draft,
        payslips_total: liasse.payrollSummary.payslips_total,
        payroll_issues: payrollIssues,
      },
    });
  }

  // Liasse readiness below threshold
  if (liasse.readinessScore < ATLAS_AI_READINESS_THRESHOLD) {
    pushUnique(anomalies, seen, {
      code: 'liasse-readiness-low',
      category: 'Liasse',
      severity: liasse.readinessScore < 60 ? 'critical' : 'warning',
      title: 'Readiness fiscale insuffisante',
      description: `Prêt pour clôture: ${liasse.readinessScore}% (seuil ${ATLAS_AI_READINESS_THRESHOLD}%)`,
      href: '/liasse',
      details: {
        readiness_score: liasse.readinessScore,
        threshold: ATLAS_AI_READINESS_THRESHOLD,
        breakdown: liasse.readinessBreakdown,
      },
    });
  }

  // Rejected validation records
  if (rejected.length > 0) {
    pushUnique(anomalies, seen, {
      code: 'validation-rejected',
      category: 'Validation',
      severity: 'critical',
      title: 'Enregistrements rejetés',
      description: `${rejected.length} enregistrement(s) de routage rejeté(s)`,
      href: '/validation',
      details: {
        count: rejected.length,
        sample_ids: rejected.slice(0, 5).map((r) => r.id),
      },
    });
  }

  // Expired legal documents
  if (expiredLegal.length > 0) {
    const sample = expiredLegal[0];
    pushUnique(anomalies, seen, {
      code: 'legal-expired',
      category: 'Juridique',
      severity: 'critical',
      title: 'Documents juridiques expirés',
      description: expiredLegal.length === 1
        ? `Contrat expiré : ${sample.title ?? 'Sans titre'}`
        : `${expiredLegal.length} document(s) juridique(s) expiré(s)`,
      entityType: 'legal_document',
      entityId: sample.id ? String(sample.id) : undefined,
      href: '/juridique',
      details: {
        count: expiredLegal.length,
        sample_titles: expiredLegal.slice(0, 5).map((d) => d.title ?? 'Sans titre'),
      },
    });
  }

  return { anomalies, readinessScore: liasse.readinessScore };
}

export async function persistAtlasAiAnomalies(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  detected: DetectedAnomaly[],
): Promise<AtlasAiAnomaly[]> {
  let del = db.from('atlas_ai_anomalies').delete().eq('user_id', userId).eq('status', 'open');
  if (companyId) del = del.eq('company_id', companyId);
  else del = del.is('company_id', null);
  const delResult = await del;
  if (delResult.error && isMissingTableError(delResult.error.message)) return [];

  if (detected.length === 0) return [];

  const rows = detected.map((a) => ({
    user_id: userId,
    company_id: companyId,
    category: a.category,
    severity: a.severity,
    title: a.title,
    description: a.description,
    entity_type: a.entityType ?? null,
    entity_id: a.entityId ?? null,
    details: { ...a.details, code: a.code, href: a.href },
    status: 'open',
  }));

  const { data, error } = await db.from('atlas_ai_anomalies').insert(rows).select('*');
  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((r) => {
    const details = (r.details && typeof r.details === 'object') ? r.details as Record<string, unknown> : {};
    return {
      id: String(r.id),
      category: String(r.category),
      severity: String(r.severity) as AiAnomalySeverity,
      title: String(r.title),
      description: String(r.description),
      entityType: r.entity_type ? String(r.entity_type) : null,
      entityId: r.entity_id ? String(r.entity_id) : null,
      status: String(r.status),
      detectedAt: String(r.detected_at),
      code: String(details.code ?? ''),
      href: details.href ? String(details.href) : undefined,
    };
  });
}
