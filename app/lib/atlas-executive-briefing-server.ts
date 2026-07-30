/**
 * CEO AI Executive Briefing — aggregates financial KPIs and generates multilingual AI reports.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';
import { detectAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { formatSourcesFooter } from '@/app/lib/atlas-ai-copilot';
import { runAtlasAiWithFallback } from '@/app/lib/atlas-ai-provider';
import { buildDebtDashboard } from '@/app/lib/atlas-debt-collection-server';
import { getReportsDashboard, resolveReportPeriod } from '@/app/lib/atlas-reports-server';
import type {
  BriefingLanguage,
  ExecutiveBriefingMetrics,
  ExecutiveBriefingPayload,
  ExecutiveBriefingReport,
} from '@/app/types/atlas-executive-briefing';
import {
  BRIEFING_LANGUAGE_PROMPTS,
} from '@/app/types/atlas-executive-briefing';
import type { AtlasReportPeriodPreset } from '@/app/types/atlas-reports';

export { BRIEFING_LANGUAGE_PROMPTS };

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

async function computeBankBalance(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { data } = await db
    .from('zafirix_bank_transactions')
    .select('debit, credit')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .limit(2000);

  return roundMad(
    (data ?? []).reduce((s, t) => s + Number(t.credit ?? 0) - Number(t.debit ?? 0), 0),
  );
}

export async function aggregateExecutiveBriefingMetrics(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  preset: AtlasReportPeriodPreset = 'month',
): Promise<ExecutiveBriefingPayload> {
  const period = resolveReportPeriod(preset);
  const [reports, debt, bankBalance, anomalies] = await Promise.all([
    getReportsDashboard(db, userId, companyId, period),
    buildDebtDashboard(db, userId, companyId).catch(() => null),
    computeBankBalance(db, userId, companyId),
    detectAtlasAiAnomalies(db, userId, companyId),
  ]);

  const kpis = reports.kpis;
  const netCashFlow = roundMad(kpis.encaissements - kpis.depensesFournisseurs);
  const grossMarginPct =
    kpis.chiffreAffaires > 0
      ? roundMad(((kpis.chiffreAffaires - kpis.depensesFournisseurs) / kpis.chiffreAffaires) * 100)
      : null;

  const metrics: ExecutiveBriefingMetrics = {
    turnover: kpis.chiffreAffaires,
    turnoverLabel: 'Chiffre d\'affaires HT',
    collections: kpis.encaissements,
    supplierExpenses: kpis.depensesFournisseurs,
    netCashFlow,
    bankBalance,
    outstandingDebt: debt?.totalDue ?? kpis.facturesImpayeesMontant,
    overdueInvoices: debt?.stats.overdueInvoices ?? kpis.facturesImpayees,
    overdueAmount: kpis.facturesImpayeesMontant,
    tvaNet: kpis.tvaNette,
    invoicesIssued: kpis.facturesEmises,
    unpaidInvoices: kpis.facturesImpayees,
    highRiskClients: debt?.stats.highRiskClients ?? 0,
    activeDebtCases: debt?.stats.activeCases ?? 0,
    grossMarginPct,
  };

  const risks = anomalies.anomalies
    .slice(0, 8)
    .map((a) => `[${a.severity}] ${a.title}: ${a.description}`);

  const highlights: string[] = [];
  if (metrics.turnover > 0) {
    highlights.push(`CA période : ${metrics.turnover.toLocaleString('fr-MA')} MAD HT`);
  }
  if (metrics.netCashFlow >= 0) {
    highlights.push(`Flux de trésorerie net positif : +${metrics.netCashFlow.toLocaleString('fr-MA')} MAD`);
  } else {
    highlights.push(`Flux de trésorerie net négatif : ${metrics.netCashFlow.toLocaleString('fr-MA')} MAD`);
  }
  if (metrics.outstandingDebt > 0) {
    highlights.push(`Créances en cours : ${metrics.outstandingDebt.toLocaleString('fr-MA')} MAD`);
  }
  if (metrics.highRiskClients > 0) {
    highlights.push(`${metrics.highRiskClients} client(s) à risque élevé en recouvrement`);
  }

  return {
    companyId,
    companyName: reports.companyName,
    period: reports.period,
    generatedAt: new Date().toISOString(),
    metrics,
    monthlyTrend: reports.monthlyEvolution,
    risks,
    highlights,
  };
}

function buildRuleBasedBriefing(
  payload: ExecutiveBriefingPayload,
  language: BriefingLanguage,
): string {
  const m = payload.metrics;
  const p = payload.period.periodLabel;

  if (language === 'en') {
    return [
      `Executive Briefing — ${payload.companyName} (${p})`,
      '',
      `Turnover (excl. VAT): ${m.turnover.toLocaleString('en-US')} MAD`,
      `Collections: ${m.collections.toLocaleString('en-US')} MAD`,
      `Supplier expenses: ${m.supplierExpenses.toLocaleString('en-US')} MAD`,
      `Net cash flow: ${m.netCashFlow.toLocaleString('en-US')} MAD`,
      `Bank position (movements): ${m.bankBalance.toLocaleString('en-US')} MAD`,
      `Outstanding receivables: ${m.outstandingDebt.toLocaleString('en-US')} MAD`,
      `Overdue invoices: ${m.overdueInvoices} (${m.overdueAmount.toLocaleString('en-US')} MAD)`,
      `Net VAT: ${m.tvaNet.toLocaleString('en-US')} MAD`,
      '',
      payload.risks.length ? `Risks:\n${payload.risks.map((r) => `• ${r}`).join('\n')}` : 'No major risks flagged.',
    ].join('\n');
  }

  if (language === 'ar') {
    return [
      `موجز تنفيذي — ${payload.companyName} (${p})`,
      '',
      `رقم الأعمال (بدون ض.ق.م): ${m.turnover.toLocaleString('ar-MA')} درهم`,
      `التحصيلات: ${m.collections.toLocaleString('ar-MA')} درهم`,
      `مصاريف الموردين: ${m.supplierExpenses.toLocaleString('ar-MA')} درهم`,
      `صافي التدفق النقدي: ${m.netCashFlow.toLocaleString('ar-MA')} درهم`,
      `الذمم المدينة: ${m.outstandingDebt.toLocaleString('ar-MA')} درهم`,
      `فواتير متأخرة: ${m.overdueInvoices}`,
    ].join('\n');
  }

  if (language === 'darija') {
    return [
      `موجز للمدير — ${payload.companyName} (${p})`,
      '',
      `رقم المعاملات: ${m.turnover.toLocaleString('fr-MA')} درهم`,
      `التحصل: ${m.collections.toLocaleString('fr-MA')} درهم`,
      `المصاريف: ${m.supplierExpenses.toLocaleString('fr-MA')} درهم`,
      `الفلوس فالبنك (mouvements): ${m.bankBalance.toLocaleString('fr-MA')} درهم`,
      `ال créances li baqaw: ${m.outstandingDebt.toLocaleString('fr-MA')} درهم`,
      `فواتير ma mkaffyin: ${m.overdueInvoices}`,
      '',
      payload.risks.length ? `المخاطر:\n${payload.risks.slice(0, 5).map((r) => `• ${r}`).join('\n')}` : 'ما كاينش خطر kbir.',
    ].join('\n');
  }

  return [
    `Briefing CEO — ${payload.companyName} (${p})`,
    '',
    `Chiffre d'affaires HT : ${m.turnover.toLocaleString('fr-FR')} MAD`,
    `Encaissements : ${m.collections.toLocaleString('fr-FR')} MAD`,
    `Dépenses fournisseurs : ${m.supplierExpenses.toLocaleString('fr-FR')} MAD`,
    `Flux de trésorerie net : ${m.netCashFlow.toLocaleString('fr-FR')} MAD`,
    `Position bancaire (mouvements) : ${m.bankBalance.toLocaleString('fr-FR')} MAD`,
    `Créances en cours : ${m.outstandingDebt.toLocaleString('fr-FR')} MAD`,
    `Factures en retard : ${m.overdueInvoices} (${m.overdueAmount.toLocaleString('fr-FR')} MAD)`,
    `TVA nette : ${m.tvaNet.toLocaleString('fr-FR')} MAD`,
    m.grossMarginPct != null ? `Marge brute estimée : ${m.grossMarginPct} %` : '',
    '',
    payload.risks.length ? `Risques :\n${payload.risks.map((r) => `• ${r}`).join('\n')}` : 'Aucun risque majeur signalé.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateExecutiveBriefing(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  opts: { preset?: AtlasReportPeriodPreset; language?: BriefingLanguage },
): Promise<ExecutiveBriefingReport> {
  const language = opts.language ?? 'fr';
  const preset = opts.preset ?? 'month';

  const payload = await aggregateExecutiveBriefingMetrics(db, userId, companyId, preset);
  const { snapshot, sources } = await buildAtlasAiContext(db, {
    userId,
    companyId,
    fiscalYear: new Date().getFullYear(),
  });

  const langInstruction = BRIEFING_LANGUAGE_PROMPTS[language];
  const metricsJson = JSON.stringify(payload.metrics, null, 2);
  const trendJson = JSON.stringify(payload.monthlyTrend.slice(-6), null, 2);

  const userMessage =
    language === 'en'
      ? `Prepare a CEO executive briefing for ${payload.companyName} (${payload.period.periodLabel}). Cover cash flow, turnover, outstanding debts, and key actions.`
      : language === 'ar'
        ? `أعد موجزاً تنفيذياً للمدير العام لـ ${payload.companyName} (${payload.period.periodLabel}). غطّ التدفق النقدي والرقم المعاملات والذمم المدينة والإجراءات الرئيسية.`
        : language === 'darija'
          ? `عطيني briefing dial CEO ل ${payload.companyName} (${payload.period.periodLabel}) : cash flow, CA, créances, wach khass ydir.`
          : `Rédige un briefing CEO pour ${payload.companyName} (${payload.period.periodLabel}) : trésorerie, CA, créances, TVA et actions prioritaires.`;

  const system = [
    'Tu es l\'assistant stratégique du dirigeant d\'une PME marocaine sur Zafirix Pro.',
    'Mode: BRIEFING EXÉCUTIF CEO.',
    langInstruction,
    'Structure: 1) Vue d\'ensemble (2-3 phrases), 2) Chiffres clés, 3) Trésorerie & flux, 4) Créances & recouvrement, 5) Risques, 6) 3 recommandations concrètes.',
    'Utilise les montants en MAD. Pas de jargon comptable excessif.',
  ].join('\n');

  const contextBlock = [
    contextToPromptBlock(snapshot),
    `[MÉTRIQUES FINANCIÈRES]\n${metricsJson}`,
    `[ÉVOLUTION MENSUELLE]\n${trendJson}`,
    `[POINTS CLÉS]\n${payload.highlights.join('\n')}`,
    `[RISQUES DÉTECTÉS]\n${payload.risks.join('\n') || 'Aucun'}`,
  ].join('\n\n');

  const ai = await runAtlasAiWithFallback({
    system,
    contextBlock,
    sourcesLine: `[SOURCES]\n${JSON.stringify(sources.slice(0, 20))}`,
    history: [],
    userMessage,
    ruleBasedFallback: () => buildRuleBasedBriefing(payload, language),
  });

  const narrative = `${ai.answer}${formatSourcesFooter(sources)}`;
  const recommendations = extractRecommendations(ai.answer, payload.risks);

  return {
    ...payload,
    language,
    narrative,
    recommendations,
    provider: ai.provider,
  };
}

function extractRecommendations(narrative: string, risks: string[]): string[] {
  const lines = narrative.split('\n').map((l) => l.trim()).filter(Boolean);
  const recs = lines.filter(
    (l) =>
      /^[-•*\d]/.test(l) &&
      (l.toLowerCase().includes('recommand') ||
        l.toLowerCase().includes('action') ||
        l.toLowerCase().includes('priorit') ||
        l.toLowerCase().includes('conseil') ||
        l.toLowerCase().includes('recommend')),
  );
  if (recs.length >= 2) return recs.slice(0, 5);
  return risks.slice(0, 3).map((r) => r.replace(/^\[[^\]]+\]\s*/, ''));
}

export async function* streamExecutiveBriefingNarrative(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  opts: Parameters<typeof generateExecutiveBriefing>[3],
): AsyncGenerator<string> {
  const result = await generateExecutiveBriefing(db, userId, companyId, opts);
  const chunkSize = 36;
  for (let i = 0; i < result.narrative.length; i += chunkSize) {
    yield result.narrative.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 5));
  }
}
