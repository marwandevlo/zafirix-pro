/**
 * Phase 13C — AI Auditor engine (rule-based + optional AI narrative).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiAnomalySeverity, AiSourceRef } from '@/app/types/atlas-ai-copilot';
import { detectAtlasAiAnomalies, persistAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';
import { buildAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';
import { runAtlasAiWithFallback } from '@/app/lib/atlas-ai-provider';
import { AUDITOR_SYSTEM } from '@/app/lib/atlas-ai-copilot';

export type AuditFinding = {
  severity: AiAnomalySeverity;
  category: string;
  title: string;
  description: string;
  href?: string;
};

export type AtlasAiAuditorReport = {
  exported_at: string;
  fiscal_year: number;
  score: number;
  risk_score: number;
  findings: AuditFinding[];
  observations: string[];
  recommendations: string[];
  criticalIssues: AuditFinding[];
  sections: {
    critical: AuditFinding[];
    tva: AuditFinding[];
    banking: AuditFinding[];
    hr: AuditFinding[];
    legal: AuditFinding[];
    fiscal: AuditFinding[];
  };
  sources: AiSourceRef[];
  provider?: string;
};

function filterCo<T extends { company_id?: string | null }>(
  rows: T[] | null | undefined,
  companyId: string | null,
): T[] {
  if (!companyId) return rows ?? [];
  return (rows ?? []).filter((r) => !r.company_id || r.company_id === companyId);
}

function computeAuditScore(findings: AuditFinding[], readinessScore: number): number {
  let score = Math.min(100, Math.max(0, readinessScore));
  for (const f of findings) {
    if (f.severity === 'critical') score -= 12;
    else if (f.severity === 'warning') score -= 5;
    else score -= 1;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function categorizeFinding(f: AuditFinding): keyof AtlasAiAuditorReport['sections'] | null {
  const cat = f.category.toLowerCase();
  if (f.severity === 'critical') return 'critical';
  if (cat.includes('tva')) return 'tva';
  if (cat.includes('banque') || cat.includes('bank')) return 'banking';
  if (cat.includes('paie') || cat.includes('payroll') || cat.includes('cnss') || cat.includes('ir')) return 'hr';
  if (cat.includes('juridique') || cat.includes('legal') || cat.includes('contrat')) return 'legal';
  if (cat.includes('liasse') || cat.includes('is') || cat.includes('fiscal')) return 'fiscal';
  return null;
}

export async function runAtlasAiAuditor(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  opts?: { fiscalYear?: number; useAiNarrative?: boolean },
): Promise<AtlasAiAuditorReport> {
  const fiscalYear = opts?.fiscalYear ?? new Date().getFullYear();
  const today = new Date().toISOString().split('T')[0];

  const { anomalies: detected } = await detectAtlasAiAnomalies(db, userId, companyId);
  await persistAtlasAiAnomalies(db, userId, companyId, detected);

  const [liasse, { snapshot, sources }, entriesRes, tvaRes, irRes, legalRes] = await Promise.all([
    runLiasseEngine(db, { userId, companyId, fiscalYear }),
    buildAtlasAiContext(db, { userId, companyId, fiscalYear }),
    db.from('atlas_accounting_entries').select('id, validation_status, company_id').eq('user_id', userId).limit(500),
    db.from('zafirix_tva_suggestions').select('id, validation_status, company_id').eq('user_id', userId).limit(200),
    db.from('atlas_ir_snapshots').select('id, fiscal_year, company_id').eq('user_id', userId).eq('fiscal_year', fiscalYear).limit(5),
    db.from('zafirix_legal_documents').select('id, title, expiry_date, company_id').eq('user_id', userId).lt('expiry_date', today).limit(20),
  ]);

  const entries = filterCo(entriesRes.data, companyId);
  const tvaRows = filterCo(tvaRes.data, companyId);
  const irRows = filterCo(irRes.data, companyId);
  const expiredLegal = filterCo(legalRes.data, companyId);

  const findings: AuditFinding[] = [
    ...detected.map((a) => ({
      severity: a.severity,
      category: a.category,
      title: a.title,
      description: a.description,
      href: a.href,
    })),
    ...liasse.checks.filter((c) => c.severity !== 'info').map((c) => ({
      severity: (c.severity === 'critical' ? 'critical' : 'warning') as AiAnomalySeverity,
      category: c.category,
      title: c.message.slice(0, 100),
      description: c.message,
    })),
  ];

  const draftEntries = entries.filter((e) => e.validation_status === 'draft').length;
  if (draftEntries > 0) {
    findings.push({
      severity: draftEntries > 10 ? 'critical' : 'warning',
      category: 'Comptabilité',
      title: 'Écritures comptables en brouillon',
      description: `${draftEntries} écriture(s) non validée(s)`,
      href: '/comptabilite',
    });
  }

  const tvaRejected = tvaRows.filter((r) => r.validation_status === 'rejected').length;
  if (tvaRejected > 0) {
    findings.push({
      severity: 'critical',
      category: 'TVA',
      title: 'Suggestions TVA rejetées',
      description: `${tvaRejected} enregistrement(s) TVA rejeté(s)`,
      href: '/tva',
    });
  }

  if (irRows.length === 0) {
    findings.push({
      severity: 'warning',
      category: 'IR',
      title: 'Snapshot IR absent',
      description: `Aucun snapshot IR pour l'exercice ${fiscalYear}`,
      href: '/ir',
    });
  }

  if (expiredLegal.length > 0) {
    findings.push({
      severity: 'critical',
      category: 'Juridique',
      title: 'Contrats expirés',
      description: `${expiredLegal.length} document(s) juridique(s) expiré(s)`,
      href: '/juridique',
    });
  }

  const uniqueFindings = findings.slice(0, 40);
  const score = computeAuditScore(uniqueFindings, liasse.readinessScore);
  const risk_score = 100 - score;

  const sections: AtlasAiAuditorReport['sections'] = {
    critical: [],
    tva: [],
    banking: [],
    hr: [],
    legal: [],
    fiscal: [],
  };

  for (const f of uniqueFindings) {
    if (f.severity === 'critical') sections.critical.push(f);
    const bucket = categorizeFinding(f);
    if (bucket && bucket !== 'critical') sections[bucket].push(f);
  }

  const observations: string[] = [
    `Score audit global: ${score}/100 (risque ${risk_score}%)`,
    `Readiness clôture: ${liasse.readinessScore}%`,
    `Banque: ${liasse.bankSummary.unreconciled_count} non rapprochée(s)`,
    `Paie: ${liasse.payrollSummary.payslips_validated}/${liasse.payrollSummary.payslips_total} bulletins validés`,
    `CNSS — déductions: ${liasse.payrollSummary.cnss_deductions ?? 0} MAD`,
  ];

  const recommendations: string[] = liasse.blockingIssues.map((b) => b.message);
  if (recommendations.length === 0) {
    recommendations.push('Maintenir la validation mensuelle TVA et paie.', 'Documenter les écritures sans pièce.');
  }

  const auditSources: AiSourceRef[] = [
    ...sources,
    { type: 'liasse', id: `audit-${fiscalYear}`, label: 'Contrôles liasse' },
    { type: 'anomaly', id: 'scan', label: `${detected.length} anomalies` },
    { type: 'audit_log', id: 'auditor', label: 'AI Auditor' },
  ];

  let provider: string | undefined;

  if (opts?.useAiNarrative !== false) {
    const prompt = `Synthétise ce rapport d'audit en observations et recommandations prioritaires.\nScore: ${score}\nFindings: ${JSON.stringify(uniqueFindings.slice(0, 12))}`;
    const ai = await runAtlasAiWithFallback({
      system: AUDITOR_SYSTEM,
      contextBlock: contextToPromptBlock(snapshot),
      sourcesLine: `[SOURCES]\n${JSON.stringify(auditSources.slice(0, 20))}`,
      history: [],
      userMessage: prompt,
      ruleBasedFallback: () =>
        observations.join('\n') + '\n\nRecommandations:\n' + recommendations.map((r) => `• ${r}`).join('\n'),
    });
    provider = ai.provider;
    const lines = ai.answer.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      if (/recommand/i.test(line)) recommendations.push(line.replace(/^[-*•]\s*/, ''));
      else if (/observ/i.test(line) || line.startsWith('•')) observations.push(line.replace(/^[-*•]\s*/, ''));
    }
  }

  const criticalIssues = uniqueFindings.filter((f) => f.severity === 'critical');

  return {
    exported_at: new Date().toISOString(),
    fiscal_year: fiscalYear,
    score,
    risk_score,
    findings: uniqueFindings,
    observations: [...new Set(observations)].slice(0, 12),
    recommendations: [...new Set(recommendations)].slice(0, 15),
    criticalIssues,
    sections,
    sources: auditSources,
    provider,
  };
}
