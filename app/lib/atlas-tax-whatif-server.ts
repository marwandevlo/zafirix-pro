/**
 * AI Tax What-If Planner — baseline loading, scenario engine, IS/TVA projection, AI narrative.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { asRecord } from '@/app/lib/atlas-json';
import { runAtlasAiWithFallback } from '@/app/lib/atlas-ai-provider';
import {
  computeIsLiquidation,
  EXPERT_DISCLAIMER,
  IS_FORMULA_VERSION,
  isRateLabel,
} from '@/app/lib/atlas-payroll-calculations';
import type {
  SavedWhatIfScenario,
  WhatIfAdjustments,
  WhatIfAiProjection,
  WhatIfBaseline,
  WhatIfComparison,
  WhatIfDashboard,
  WhatIfScenarioResult,
} from '@/app/types/atlas-tax-whatif';
import {
  DEFAULT_ASSET_VAT_RATE,
  DEFAULT_PURCHASE_VAT_RATE,
  DEFAULT_SALES_VAT_RATE,
} from '@/app/types/atlas-tax-whatif';

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

function applyDelta(base: number, pct = 0, abs = 0): number {
  return roundMad(base * (1 + pct / 100) + abs);
}

function effectiveRate(numerator: number, denominator: number, fallback: number): number {
  if (denominator <= 0) return fallback;
  const rate = numerator / denominator;
  return rate > 0 && rate <= 0.3 ? roundMad(rate * 10000) / 10000 : fallback;
}

export function computeWhatIfScenario(
  baseline: WhatIfBaseline,
  adjustments: WhatIfAdjustments,
  label = 'Scénario simulé',
): WhatIfScenarioResult {
  const assetPurchaseHT = Math.max(0, adjustments.assetPurchaseHT ?? 0);
  const assetVatRate = adjustments.assetVatRate ?? DEFAULT_ASSET_VAT_RATE;

  const revenueHT = applyDelta(
    baseline.revenueHT,
    adjustments.revenueDeltaPct ?? 0,
    adjustments.revenueDeltaAbs ?? 0,
  );
  const supplierExpensesHT = applyDelta(
    baseline.supplierExpensesHT,
    adjustments.supplierDeltaPct ?? 0,
    adjustments.supplierDeltaAbs ?? 0,
  ) + assetPurchaseHT;
  const payrollTotal = applyDelta(
    baseline.payrollTotal,
    adjustments.payrollDeltaPct ?? 0,
    adjustments.payrollDeltaAbs ?? 0,
  );
  const accountingCharges = applyDelta(
    baseline.accountingCharges,
    adjustments.accountingDeltaPct ?? 0,
    adjustments.accountingDeltaAbs ?? 0,
  );

  const taxableResult = roundMad(revenueHT - supplierExpensesHT - payrollTotal - accountingCharges);
  const is = computeIsLiquidation(revenueHT, taxableResult, baseline.fiscalYear);

  const salesVatRate = baseline.effectiveSalesVatRate || DEFAULT_SALES_VAT_RATE;
  const purchaseVatRate = baseline.effectivePurchaseVatRate || DEFAULT_PURCHASE_VAT_RATE;

  const tvaCollectee = roundMad(revenueHT * salesVatRate);
  const tvaDeductible = roundMad(
    (supplierExpensesHT - assetPurchaseHT) * purchaseVatRate + assetPurchaseHT * assetVatRate,
  );
  const tvaNet = roundMad(tvaCollectee - tvaDeductible);

  const baselineTaxBurden = baseline.is.isDue + Math.max(0, baseline.tvaNet);
  const scenarioTaxBurden = is.isDue + Math.max(0, tvaNet);

  return {
    label,
    revenueHT,
    supplierExpensesHT,
    payrollTotal,
    accountingCharges,
    assetPurchaseHT,
    taxableResult,
    is,
    tvaCollectee,
    tvaDeductible,
    tvaNet,
    deltaVsBaseline: {
      revenueHT: roundMad(revenueHT - baseline.revenueHT),
      taxableResult: roundMad(taxableResult - baseline.taxableResult),
      isDue: roundMad(is.isDue - baseline.is.isDue),
      tvaNet: roundMad(tvaNet - baseline.tvaNet),
      totalTaxBurden: roundMad(scenarioTaxBurden - baselineTaxBurden),
    },
  };
}

export function buildWhatIfComparison(
  baseline: WhatIfBaseline,
  adjustments: WhatIfAdjustments,
  label?: string,
): WhatIfComparison {
  return {
    baseline,
    adjustments,
    scenario: computeWhatIfScenario(baseline, adjustments, label),
  };
}

async function assertCompanyOwned(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('company_not_found');
}

export async function loadFiscalBaseline(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
): Promise<WhatIfBaseline> {
  await assertCompanyOwned(db, userId, companyId);

  const periodStart = `${fiscalYear}-01-01`;
  const periodEnd = `${fiscalYear}-12-31`;

  const [invRes, supRes, accRes, payrollRes] = await Promise.all([
    db
      .from('atlas_invoices')
      .select('amount_ht, vat_amount, status, issue_date')
      .eq('company_id', companyId)
      .gte('issue_date', periodStart)
      .lte('issue_date', periodEnd),
    db
      .from('atlas_supplier_invoices')
      .select('amount_ht, vat_amount, invoice_date')
      .eq('company_id', companyId)
      .gte('invoice_date', periodStart)
      .lte('invoice_date', periodEnd),
    db
      .from('atlas_accounting_entries')
      .select('entry_json, entry_date')
      .eq('company_id', companyId)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd),
    db
      .from('atlas_payroll_runs')
      .select('total_gross, period_year')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('period_year', fiscalYear),
  ]);

  if (invRes.error) throw new Error(invRes.error.message);
  if (supRes.error) throw new Error(supRes.error.message);
  if (accRes.error) throw new Error(accRes.error.message);

  const activeInvoices = (invRes.data ?? []).filter(
    (i) => String((i as { status: string }).status) !== 'cancelled',
  );

  const revenueHT = activeInvoices.reduce(
    (s, i) => s + Number((i as { amount_ht: number | null }).amount_ht ?? 0),
    0,
  );
  const tvaCollecteeRaw = activeInvoices.reduce(
    (s, i) => s + Number((i as { vat_amount: number | null }).vat_amount ?? 0),
    0,
  );

  const supplierExpensesHT = (supRes.data ?? []).reduce(
    (s, r) => s + Number((r as { amount_ht: number | null }).amount_ht ?? 0),
    0,
  );
  const tvaDeductibleRaw = (supRes.data ?? []).reduce(
    (s, r) => s + Number((r as { vat_amount: number | null }).vat_amount ?? 0),
    0,
  );

  let accountingCharges = 0;
  for (const row of accRes.data ?? []) {
    const entry = asRecord((row as { entry_json: unknown }).entry_json);
    if (!entry) continue;
    const compte = String(entry.compte ?? '');
    const debit = Number(entry.debit ?? 0);
    if (debit > 0 && !compte.startsWith('445') && !compte.startsWith('512')) {
      accountingCharges += debit;
    }
  }

  const payrollTotal = payrollRes.error
    ? 0
    : (payrollRes.data ?? []).reduce(
        (s, r) => s + Number((r as { total_gross: number }).total_gross ?? 0),
        0,
      );

  const taxableResult = roundMad(revenueHT - supplierExpensesHT - payrollTotal - accountingCharges);
  const is = computeIsLiquidation(revenueHT, taxableResult, fiscalYear);

  const effectiveSalesVatRate = effectiveRate(tvaCollecteeRaw, revenueHT, DEFAULT_SALES_VAT_RATE);
  const effectivePurchaseVatRate = effectiveRate(
    tvaDeductibleRaw,
    supplierExpensesHT,
    DEFAULT_PURCHASE_VAT_RATE,
  );

  const tvaCollectee = roundMad(revenueHT * effectiveSalesVatRate);
  const tvaDeductible = roundMad(supplierExpensesHT * effectivePurchaseVatRate);
  const tvaNet = roundMad(tvaCollectee - tvaDeductible);

  return {
    fiscalYear,
    revenueHT: roundMad(revenueHT),
    supplierExpensesHT: roundMad(supplierExpensesHT),
    payrollTotal: roundMad(payrollTotal),
    accountingCharges: roundMad(accountingCharges),
    assetPurchaseHT: 0,
    taxableResult,
    is,
    tvaCollectee,
    tvaDeductible,
    tvaNet,
    effectiveSalesVatRate,
    effectivePurchaseVatRate,
    formulaVersion: IS_FORMULA_VERSION,
    disclaimer: EXPERT_DISCLAIMER,
  };
}

function rowToSavedScenario(row: Record<string, unknown>): SavedWhatIfScenario {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    fiscalYear: Number(row.fiscal_year ?? new Date().getFullYear()),
    baseline: (row.baseline_json ?? {}) as WhatIfBaseline,
    adjustments: (row.adjustments_json ?? {}) as WhatIfAdjustments,
    results: (row.results_json ?? {}) as WhatIfScenarioResult,
    aiProjection: (row.ai_projection as string | null) ?? null,
    aiProvider: (row.ai_provider as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function listSavedWhatIfScenarios(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear?: number,
): Promise<SavedWhatIfScenario[]> {
  let query = db
    .from('zafirix_tax_whatif_scenarios')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (fiscalYear != null) query = query.eq('fiscal_year', fiscalYear);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToSavedScenario(r as Record<string, unknown>));
}

export async function saveWhatIfScenario(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    name: string;
    fiscalYear: number;
    baseline: WhatIfBaseline;
    adjustments: WhatIfAdjustments;
    results: WhatIfScenarioResult;
    aiProjection?: string;
    aiProvider?: string;
  },
): Promise<SavedWhatIfScenario> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('zafirix_tax_whatif_scenarios')
    .insert({
      user_id: userId,
      company_id: companyId,
      name: input.name,
      fiscal_year: input.fiscalYear,
      baseline_json: input.baseline,
      adjustments_json: input.adjustments,
      results_json: input.results,
      ai_projection: input.aiProjection ?? null,
      ai_provider: input.aiProvider ?? null,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'save_failed');
  return rowToSavedScenario(data as Record<string, unknown>);
}

export async function buildWhatIfDashboard(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
): Promise<WhatIfDashboard> {
  const [baseline, savedScenarios] = await Promise.all([
    loadFiscalBaseline(db, userId, companyId, fiscalYear),
    listSavedWhatIfScenarios(db, userId, companyId, fiscalYear),
  ]);

  return {
    baseline,
    savedScenarios,
    lastComparison: null,
  };
}

function buildRuleBasedProjection(comparison: WhatIfComparison): WhatIfAiProjection {
  const { baseline, scenario, adjustments } = comparison;
  const d = scenario.deltaVsBaseline;

  const isDir = d.isDue > 0 ? 'augmente' : d.isDue < 0 ? 'diminue' : 'reste stable';
  const tvaDir = d.tvaNet > 0 ? 'augmente' : d.tvaNet < 0 ? 'diminue' : 'reste stable';

  const recommendations: string[] = [];
  if (d.isDue > 0 && adjustments.revenueDeltaPct && adjustments.revenueDeltaPct > 0) {
    recommendations.push('Anticiper les acomptes provisionnels IS si la croissance du CA se confirme.');
  }
  if (adjustments.assetPurchaseHT && adjustments.assetPurchaseHT > 0) {
    recommendations.push('Vérifier le traitement comptable de l\'investissement (amortissement vs charge immédiate).');
  }
  if (d.tvaNet > 5000) {
    recommendations.push('Renforcer la trésorerie TVA pour la déclaration du trimestre suivant.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Conserver une marge de trésorerie équivalente à 2 mois de charges fiscales.');
  }

  const risks: string[] = [];
  if (scenario.is.cotisationMinimaleAppliquee) {
    risks.push('La cotisation minimale IS (0,5% du CA) s\'applique — résultat fiscal faible ou négatif.');
  }
  if (d.taxableResult < 0) {
    risks.push('Résultat fiscal simulé négatif — impact trésorerie et reports à valider avec l\'EC.');
  }

  return {
    summary: `Scénario « ${scenario.label} » : IS ${isDir} de ${Math.abs(d.isDue).toLocaleString('fr-MA')} MAD, TVA nette ${tvaDir} de ${Math.abs(d.tvaNet).toLocaleString('fr-MA')} MAD vs baseline ${baseline.fiscalYear}.`,
    isAnalysis: `Résultat fiscal simulé : ${scenario.taxableResult.toLocaleString('fr-MA')} MAD (taux indicatif ${isRateLabel(scenario.taxableResult)}). IS dû : ${scenario.is.isDue.toLocaleString('fr-MA')} MAD vs ${baseline.is.isDue.toLocaleString('fr-MA')} MAD en baseline.`,
    tvaAnalysis: `TVA collectée ${scenario.tvaCollectee.toLocaleString('fr-MA')} MAD, déductible ${scenario.tvaDeductible.toLocaleString('fr-MA')} MAD → nette ${scenario.tvaNet.toLocaleString('fr-MA')} MAD.`,
    recommendations,
    risks,
    provider: 'rule-based',
    disclaimer: EXPERT_DISCLAIMER,
  };
}

function parseAiProjection(text: string, provider: string): WhatIfAiProjection {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<WhatIfAiProjection>;
      return {
        summary: String(parsed.summary ?? text.slice(0, 400)),
        isAnalysis: String(parsed.isAnalysis ?? ''),
        tvaAnalysis: String(parsed.tvaAnalysis ?? ''),
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
        provider,
        disclaimer: EXPERT_DISCLAIMER,
      };
    }
  } catch {
    /* fall through */
  }
  return {
    summary: text.slice(0, 600),
    isAnalysis: '',
    tvaAnalysis: '',
    recommendations: [],
    risks: [],
    provider,
    disclaimer: EXPERT_DISCLAIMER,
  };
}

export async function generateWhatIfAiProjection(
  comparison: WhatIfComparison,
  userQuestion?: string,
): Promise<WhatIfAiProjection> {
  const { baseline, scenario, adjustments } = comparison;

  const contextBlock = [
    '[BASELINE FISCAL]',
    JSON.stringify({
      fiscalYear: baseline.fiscalYear,
      revenueHT: baseline.revenueHT,
      taxableResult: baseline.taxableResult,
      isDue: baseline.is.isDue,
      tvaNet: baseline.tvaNet,
      formulaVersion: baseline.formulaVersion,
    }, null, 2),
    '[AJUSTEMENTS SCÉNARIO]',
    JSON.stringify(adjustments, null, 2),
    '[RÉSULTATS SIMULÉS]',
    JSON.stringify({
      label: scenario.label,
      revenueHT: scenario.revenueHT,
      taxableResult: scenario.taxableResult,
      isDue: scenario.is.isDue,
      tvaNet: scenario.tvaNet,
      delta: scenario.deltaVsBaseline,
      cotisationMinimale: scenario.is.cotisationMinimaleAppliquee,
    }, null, 2),
  ].join('\n');

  const system = `Tu es un expert fiscal marocain (IS, TVA, CGI). Analyse un scénario what-if fiscal.
Réponds UNIQUEMENT en JSON valide avec les clés : summary, isAnalysis, tvaAnalysis, recommendations (array), risks (array).
Langue : français. Mentionne que les montants sont indicatifs (${EXPERT_DISCLAIMER}).`;

  const userMessage = userQuestion?.trim()
    || 'Projette l\'impact fiscal IS et TVA de ce scénario et propose des recommandations de trésorerie.';

  const result = await runAtlasAiWithFallback({
    system,
    contextBlock,
    sourcesLine: '[SOURCES] Données Atlas : factures, charges fournisseurs, paie, écritures comptables.',
    history: [],
    userMessage,
    ruleBasedFallback: () => JSON.stringify(buildRuleBasedProjection(comparison)),
  });

  return parseAiProjection(result.answer, result.provider);
}

export { isRateLabel, EXPERT_DISCLAIMER, IS_FORMULA_VERSION };
