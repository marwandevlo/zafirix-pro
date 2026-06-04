/**
 * Phase 13C — Executive summary engine (month / quarter / year).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';
import { buildAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';
import { detectAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { runAtlasAiWithFallback } from '@/app/lib/atlas-ai-provider';
import { COPILOT_SYSTEM, formatSourcesFooter } from '@/app/lib/atlas-ai-copilot';

export type ExecutivePeriod = 'month' | 'quarter' | 'year';

export type ExecutiveSummaryMetrics = {
  chiffre_affaires: number;
  charges: number;
  resultat: number;
  tva: number;
  tresorerie: number;
  unpaid_invoices: number;
  risk_count: number;
};

export type ExecutiveSummaryResult = {
  period: ExecutivePeriod;
  period_label: string;
  fiscal_year: number;
  metrics: ExecutiveSummaryMetrics;
  narrative: string;
  risks: string[];
  recommendations: string[];
  sources: AiSourceRef[];
  provider?: string;
};

function periodLabel(period: ExecutivePeriod, year: number, month?: number, quarter?: number): string {
  if (period === 'month' && month) return `${String(month).padStart(2, '0')}/${year}`;
  if (period === 'quarter' && quarter) return `T${quarter} ${year}`;
  return `Exercice ${year}`;
}

function filterCo<T extends { company_id?: string | null }>(
  rows: T[] | null | undefined,
  companyId: string | null,
): T[] {
  if (!companyId) return rows ?? [];
  return (rows ?? []).filter((r) => !r.company_id || r.company_id === companyId);
}

export async function generateExecutiveSummary(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  opts: { period?: ExecutivePeriod; year?: number; month?: number; quarter?: number },
): Promise<ExecutiveSummaryResult> {
  const period = opts.period ?? 'month';
  const fiscalYear = opts.year ?? new Date().getFullYear();
  const month = opts.month ?? new Date().getMonth() + 1;
  const quarter = opts.quarter ?? Math.ceil(month / 3);

  const { snapshot, sources } = await buildAtlasAiContext(db, { userId, companyId, fiscalYear });
  const { anomalies } = await detectAtlasAiAnomalies(db, userId, companyId);

  const [invoicesRes, entriesRes, bankRes] = await Promise.all([
    db.from('atlas_invoices').select('total_ttc, status, created_at, company_id').eq('user_id', userId).limit(500),
    db.from('atlas_accounting_entries').select('entry_json, company_id').eq('user_id', userId).limit(500),
    db.from('zafirix_bank_transactions').select('debit, credit, company_id').eq('user_id', userId).limit(200),
  ]);

  const invoices = filterCo(invoicesRes.data, companyId);
  const entries = filterCo(entriesRes.data, companyId);
  const bank = filterCo(bankRes.data, companyId);

  const ca = invoices.reduce((s, i) => s + Number(i.total_ttc ?? 0), 0);
  const charges = entries.reduce((s, e) => {
    const j = e.entry_json as { debit?: number; credit?: number; type?: string } | null;
    return s + Number(j?.debit ?? 0);
  }, 0);
  const tresorerie = bank.reduce((s, t) => s + Number(t.credit ?? 0) - Number(t.debit ?? 0), 0);
  const unpaid = invoices.filter((i) => i.status !== 'paid').length;

  const inv = snapshot.invoices as { unpaid_total_mad?: number } | undefined;
  const tvaCtx = snapshot.tva as { narrative?: string } | undefined;

  const metrics: ExecutiveSummaryMetrics = {
    chiffre_affaires: Math.round(ca * 100) / 100,
    charges: Math.round(charges * 100) / 100,
    resultat: Math.round((ca - charges) * 100) / 100,
    tva: 0,
    tresorerie: Math.round(tresorerie * 100) / 100,
    unpaid_invoices: unpaid,
    risk_count: anomalies.length,
  };

  const risks = anomalies.slice(0, 8).map((a) => `${a.severity.toUpperCase()}: ${a.title}`);
  const recommendations = anomalies.slice(0, 5).map((a) => a.description);

  const periodLbl = periodLabel(period, fiscalYear, month, quarter);
  const userMessage =
    period === 'month'
      ? `Résume mon activité du mois (${periodLbl}) pour un dirigeant.`
      : period === 'quarter'
        ? `Résume mon activité du trimestre (${periodLbl}) pour un dirigeant.`
        : `Résume mon activité de l'exercice ${fiscalYear} pour un dirigeant.`;

  const metricsBlock = `[MÉTRIQUES]\n${JSON.stringify(metrics, null, 2)}\n[TVA]\n${tvaCtx?.narrative ?? 'N/A'}\n[IMPAYÉS]\n${inv?.unpaid_total_mad ?? 0} MAD`;

  const ai = await runAtlasAiWithFallback({
    system: `${COPILOT_SYSTEM}\n\nMode: SYNTHÈSE EXÉCUTIVE. Langage simple, orienté dirigeant. Inclure CA, charges, résultat, TVA, trésorerie, risques, recommandations.`,
    contextBlock: `${contextToPromptBlock(snapshot)}\n\n${metricsBlock}`,
    sourcesLine: `[SOURCES]\n${JSON.stringify(sources.slice(0, 25))}`,
    history: [],
    userMessage,
    ruleBasedFallback: () => buildRuleBasedExecutiveSummary(periodLbl, metrics, risks, recommendations),
  });

  const narrative = `${ai.answer}${formatSourcesFooter(sources)}`;

  return {
    period,
    period_label: periodLbl,
    fiscal_year: fiscalYear,
    metrics,
    narrative,
    risks,
    recommendations,
    sources,
    provider: ai.provider,
  };
}

function buildRuleBasedExecutiveSummary(
  periodLabel: string,
  metrics: ExecutiveSummaryMetrics,
  risks: string[],
  recommendations: string[],
): string {
  return [
    `Synthèse exécutive — ${periodLabel}`,
    '',
    `Chiffre d'affaires: ${metrics.chiffre_affaires.toLocaleString('fr-FR')} MAD`,
    `Charges: ${metrics.charges.toLocaleString('fr-FR')} MAD`,
    `Résultat estimé: ${metrics.resultat.toLocaleString('fr-FR')} MAD`,
    `Trésorerie nette (mouvements): ${metrics.tresorerie.toLocaleString('fr-FR')} MAD`,
    `Factures impayées: ${metrics.unpaid_invoices}`,
    '',
    risks.length ? `Risques:\n${risks.map((r) => `• ${r}`).join('\n')}` : 'Aucun risque majeur détecté.',
    '',
    recommendations.length ? `Recommandations:\n${recommendations.map((r) => `• ${r}`).join('\n')}` : 'Continuer le suivi mensuel TVA et paie.',
  ].join('\n');
}

export async function* streamExecutiveSummaryNarrative(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  opts: Parameters<typeof generateExecutiveSummary>[3],
): AsyncGenerator<string> {
  const result = await generateExecutiveSummary(db, userId, companyId, opts);
  const chunkSize = 40;
  for (let i = 0; i < result.narrative.length; i += chunkSize) {
    yield result.narrative.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 6));
  }
}
