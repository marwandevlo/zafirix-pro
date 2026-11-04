/**
 * Business Studio analysis: simulator, sensitivity, stress tests, scenario comparison and rule-based findings.
 * Findings are computed from the study only. Each one states whether it is a calculated fact, a check on a user
 * assumption or a market convention, and points to the series it comes from. Nothing here invents market data.
 */

import { computeStudy, type LineKey, type StudyResult } from './engine';
import { computeMetrics, type StudyMetrics } from './metrics';
import { type Levers, NEUTRAL_LEVERS, type StudyModel } from './model';
import { formatCentsMad, formatNumber, formatPercent, monthLabel, type Lang } from './i18n';
import { ruleById } from './tax-rules';

const SIM_ID = '__simulation__';

/** Runs the model with ad-hoc levers stacked on top of a scenario's levers. */
/** Adds lever deltas to a scenario's levers; the IS rate override replaces instead of adding. */
export function mergeLevers(base: Levers, deltas: Partial<Levers>): Levers {
  const out: Levers = { ...base };
  for (const [k, v] of Object.entries(deltas) as Array<[keyof Levers, number | null | undefined]>) {
    if (v == null) continue;
    if (k === 'isRateOverridePct') out.isRateOverridePct = v;
    else (out[k] as number) = ((base[k] as number) ?? 0) + v;
  }
  return out;
}

export function computeWithLevers(model: StudyModel, levers: Partial<Levers>, baseScenarioId?: string): { result: StudyResult; metrics: StudyMetrics } {
  const base = model.scenarios.find((s) => s.id === (baseScenarioId ?? model.activeScenarioId)) ?? model.scenarios[0];
  const merged = mergeLevers(base?.levers ?? NEUTRAL_LEVERS, levers);
  const m: StudyModel = {
    ...model,
    scenarios: [...model.scenarios, { id: SIM_ID, name: 'Simulation', kind: 'custom', description: '', levers: merged, parentId: base?.id ?? null, createdAt: '' }],
  };
  const result = computeStudy(m, SIM_ID);
  return { result, metrics: computeMetrics(m, result) };
}

// ─── Sensitivity ─────────────────────────────────────────────────────────────────────────────────

export type SensitivityLever = { id: keyof Levers; label: string; unit: 'pct' | 'pts' | 'days' | 'months' };

export const SENSITIVITY_LEVERS: readonly SensitivityLever[] = [
  { id: 'priceFactorPct', label: 'Prix de vente', unit: 'pct' },
  { id: 'volumeFactorPct', label: 'Volumes', unit: 'pct' },
  { id: 'unitCostFactorPct', label: 'Coût unitaire', unit: 'pct' },
  { id: 'opexFactorPct', label: 'Charges externes', unit: 'pct' },
  { id: 'wageFactorPct', label: 'Salaires', unit: 'pct' },
  { id: 'capexFactorPct', label: 'Investissements', unit: 'pct' },
  { id: 'interestDeltaPts', label: 'Taux d’intérêt', unit: 'pts' },
  { id: 'dsoDeltaDays', label: 'Délai clients', unit: 'days' },
  { id: 'launchDelayMonths', label: 'Retard de lancement', unit: 'months' },
];

export type SensitivityMetric = 'npv' | 'netIncome' | 'cashEnd' | 'minCash' | 'irrProject' | 'peakFundingNeed';
export const SENSITIVITY_METRICS: Record<SensitivityMetric, string> = {
  npv: 'VAN', netIncome: 'Résultat net cumulé', cashEnd: 'Trésorerie finale', minCash: 'Trésorerie minimale',
  irrProject: 'TRI projet', peakFundingNeed: 'Besoin de financement maximal',
};

function metricValue(x: StudyMetrics, k: SensitivityMetric): number | null {
  switch (k) {
    case 'npv': return x.npv.value;
    case 'netIncome': return x.totals.netIncome;
    case 'cashEnd': return x.cashEnd.value;
    case 'minCash': return x.minCash.value;
    case 'irrProject': return x.irrProject.value;
    case 'peakFundingNeed': return x.peakFundingNeed.value;
  }
}

export type TornadoBar = { lever: SensitivityLever; low: number; high: number; valueLow: number | null; valueHigh: number | null; base: number | null };

/** One-at-a-time sensitivity: each lever moved by −delta and +delta from the scenario. */
export function tornado(model: StudyModel, metric: SensitivityMetric, scenarioId?: string, deltas: Partial<Record<keyof Levers, number>> = {}): TornadoBar[] {
  const base = metricValue(computeWithLevers(model, {}, scenarioId).metrics, metric);
  const defaultDelta = (l: SensitivityLever) => (l.unit === 'pct' ? 10 : l.unit === 'pts' ? 1 : l.unit === 'days' ? 30 : 3);
  return SENSITIVITY_LEVERS.map((lever) => {
    const d = deltas[lever.id] ?? defaultDelta(lever);
    const low = lever.unit === 'months' ? 0 : -d;
    const valueLow = low === 0 ? base : metricValue(computeWithLevers(model, { [lever.id]: low }, scenarioId).metrics, metric);
    const valueHigh = metricValue(computeWithLevers(model, { [lever.id]: d }, scenarioId).metrics, metric);
    return { lever, low, high: d, valueLow, valueHigh, base };
  }).sort((a, b) => spread(b) - spread(a));
}
const spread = (b: TornadoBar) => Math.abs((b.valueHigh ?? 0) - (b.valueLow ?? 0));

export type SensitivityMatrix = { rowLever: SensitivityLever; colLever: SensitivityLever; rows: number[]; cols: number[]; values: (number | null)[][]; metric: SensitivityMetric };

export function sensitivityMatrix(
  model: StudyModel, rowLever: keyof Levers, colLever: keyof Levers, rows: number[], cols: number[], metric: SensitivityMetric, scenarioId?: string,
): SensitivityMatrix {
  const find = (id: keyof Levers) => SENSITIVITY_LEVERS.find((l) => l.id === id) ?? { id, label: String(id), unit: 'pct' as const };
  const values = rows.map((rv) => cols.map((cv) => metricValue(computeWithLevers(model, { [rowLever]: rv, [colLever]: cv }, scenarioId).metrics, metric)));
  return { rowLever: find(rowLever), colLever: find(colLever), rows, cols, values, metric };
}

// ─── Stress tests ────────────────────────────────────────────────────────────────────────────────

export type StressTest = { id: string; label: string; levers: Partial<Levers> };
/** Hypothetical shocks for resilience testing; they are not forecasts. */
export const STRESS_TESTS: readonly StressTest[] = [
  { id: 'revenue-30', label: 'Chute des volumes de 30 %', levers: { volumeFactorPct: -30 } },
  { id: 'price-15', label: 'Baisse des prix de 15 %', levers: { priceFactorPct: -15 } },
  { id: 'costs+20', label: 'Hausse des coûts unitaires et des charges de 20 %', levers: { unitCostFactorPct: 20, opexFactorPct: 20 } },
  { id: 'dso+60', label: 'Allongement du délai clients de 60 jours', levers: { dsoDeltaDays: 60 } },
  { id: 'rates+3', label: 'Hausse des taux d’intérêt de 3 points', levers: { interestDeltaPts: 3 } },
  { id: 'delay6', label: 'Retard de lancement de 6 mois', levers: { launchDelayMonths: 6 } },
  { id: 'combined', label: 'Choc combiné (volumes −20 %, coûts +10 %, clients +30 jours)', levers: { volumeFactorPct: -20, unitCostFactorPct: 10, opexFactorPct: 10, dsoDeltaDays: 30 } },
];

export type StressResult = {
  test: StressTest; netIncome: number; minCash: number | null; minCashMonth: number | undefined; npv: number | null; minDscr: number | null;
  cashNegative: boolean; dscrBelowOne: boolean; equityNegative: boolean;
};

export function runStressTests(model: StudyModel, scenarioId?: string, tests: readonly StressTest[] = STRESS_TESTS): StressResult[] {
  return tests.map((t) => {
    const { result, metrics } = computeWithLevers(model, t.levers, scenarioId);
    return {
      test: t, netIncome: metrics.totals.netIncome, minCash: metrics.minCash.value, minCashMonth: metrics.minCash.month,
      npv: metrics.npv.value, minDscr: metrics.minDscr.value,
      cashNegative: (metrics.minCash.value ?? 0) < 0,
      dscrBelowOne: metrics.minDscr.value != null && metrics.minDscr.value < 1,
      equityNegative: result.monthly.equity.some((e) => e < 0),
    };
  });
}

// ─── Scenario comparison ─────────────────────────────────────────────────────────────────────────

export type ScenarioSummary = { id: string; name: string; kind: string; result: StudyResult; metrics: StudyMetrics };

export function compareScenarios(model: StudyModel, ids?: string[]): ScenarioSummary[] {
  return model.scenarios
    .filter((s) => !ids || ids.includes(s.id))
    .map((s) => {
      const result = computeStudy(model, s.id);
      return { id: s.id, name: s.name, kind: s.kind, result, metrics: computeMetrics(model, result) };
    });
}

// ─── Findings ────────────────────────────────────────────────────────────────────────────────────

export type FindingKind = 'calculated' | 'assumption' | 'convention';
export type Finding = {
  id: string; kind: FindingKind; severity: 'info' | 'warning' | 'critical'; title: string; detail: string;
  refs: Array<{ key: LineKey | string; month?: number; fiscalYear?: number }>;
};

type Bi = { fr: string; ar: string };
const bi = (fr: string, ar: string): Bi => ({ fr, ar });

/** Findings in the requested language; amounts, percentages and months are formatted for that language. */
export function findings(model: StudyModel, r: StudyResult, x: StudyMetrics, lang: Lang = 'fr'): Finding[] {
  const out: Finding[] = [];
  const M = r.monthly;
  const N = r.calendar.months;
  const lab = (m: number) => monthLabel(r.calendar.labels[m], lang);
  const mad = (cents: number) => `${formatCentsMad(cents, lang)} ${lang === 'ar' ? 'درهم' : 'MAD'}`;
  const pct = (share: number, digits: number) => formatPercent(share * 100, lang, digits);
  const add = (f: Omit<Finding, 'title' | 'detail'> & { title: Bi; detail: Bi }) => out.push({ ...f, title: f.title[lang], detail: f.detail[lang] });

  if (!r.checks.ok) {
    add({ id: 'reconciliation', kind: 'calculated', severity: 'critical', title: bi('Contrôles de cohérence en échec', 'فشل مراقبة الاتساق'),
      detail: bi('Les états ne se rapprochent pas ; les résultats ne doivent pas être utilisés.', 'القوائم غير متطابقة؛ لا يجب استعمال النتائج.'), refs: [{ key: 'balanceDiff' }] });
  }
  if (x.minCash.value != null && x.minCash.value < 0) {
    add({
      id: 'cash-negative', kind: 'calculated', severity: 'critical', title: bi('Trésorerie négative', 'خزينة سالبة'),
      detail: bi(
        `La trésorerie descend à ${mad(x.minCash.value)} en ${lab(x.minCash.month!)} : un financement complémentaire de ce montant au moins est nécessaire.`,
        `تنخفض الخزينة إلى ${mad(x.minCash.value)} في ${lab(x.minCash.month!)}: يلزم تمويل إضافي بهذا المبلغ على الأقل.`,
      ),
      refs: [{ key: 'cash', month: x.minCash.month }],
    });
  } else if (model.workingCapital.minimumCash > 0 && x.minCash.value != null && x.minCash.value < model.workingCapital.minimumCash * 100) {
    add({
      id: 'cash-below-minimum', kind: 'calculated', severity: 'warning', title: bi('Trésorerie sous le minimum souhaité', 'خزينة أقل من الحد الأدنى المرغوب'),
      detail: bi(
        `Point bas ${mad(x.minCash.value)} en ${lab(x.minCash.month!)} pour un minimum saisi de ${mad(model.workingCapital.minimumCash * 100)}.`,
        `أدنى مستوى ${mad(x.minCash.value)} في ${lab(x.minCash.month!)} مقابل حد أدنى مُدخل قدره ${mad(model.workingCapital.minimumCash * 100)}.`,
      ),
      refs: [{ key: 'cash', month: x.minCash.month }],
    });
  }
  const negEq = M.equity.findIndex((e) => e < 0);
  if (negEq >= 0) {
    add({ id: 'equity-negative', kind: 'calculated', severity: 'critical', title: bi('Capitaux propres négatifs', 'أموال ذاتية سالبة'),
      detail: bi(`À partir de ${lab(negEq)}.`, `ابتداءً من ${lab(negEq)}.`), refs: [{ key: 'equity', month: negEq }] });
  }
  for (const y of x.years) {
    if (y.dscr.value != null && y.dscr.value < 1.2) {
      add({
        id: `dscr-${y.index}`, kind: 'convention', severity: y.dscr.value < 1 ? 'critical' : 'warning',
        title: bi(`DSCR ${y.label} : ${formatNumber(y.dscr.value, 'fr', 2)}`, `نسبة تغطية خدمة الدين ${y.label}: ${formatNumber(y.dscr.value, 'ar', 2)}`),
        detail: y.dscr.value < 1
          ? bi('Les flux d’exploitation ne couvrent pas le service de la dette.', 'تدفقات الاستغلال لا تغطي خدمة الدين.')
          : bi('Inférieur au seuil de 1,2 souvent demandé par les banques (pratique de marché).', 'أقل من عتبة 1.2 التي تطلبها البنوك غالباً (ممارسة سوقية).'),
        refs: [{ key: 'cfo', fiscalYear: y.index }, { key: 'cashOutPrincipal', fiscalYear: y.index }],
      });
    }
    if (y.revenue > 0 && y.breakEvenRevenue.value == null) {
      add({ id: `be-${y.index}`, kind: 'calculated', severity: 'warning', title: bi(`Seuil de rentabilité ${y.label} inatteignable`, `عتبة المردودية ${y.label} غير قابلة للبلوغ`),
        detail: bi(y.breakEvenRevenue.reason ?? '', 'الهامش على التكاليف المتغيرة منعدم أو سالب.'), refs: [{ key: 'revenue', fiscalYear: y.index }] });
    } else if (y.safetyMarginPct.value != null && y.safetyMarginPct.value < 0) {
      add({
        id: `be-${y.index}`, kind: 'calculated', severity: 'warning', title: bi(`Seuil de rentabilité ${y.label} non atteint`, `عتبة المردودية ${y.label} غير مبلوغة`),
        detail: bi(`CA ${mad(y.revenue)} pour un CA critique de ${mad(y.breakEvenRevenue.value!)}.`, `رقم المعاملات ${mad(y.revenue)} مقابل رقم معاملات حرج قدره ${mad(y.breakEvenRevenue.value!)}.`),
        refs: [{ key: 'revenue', fiscalYear: y.index }],
      });
    }
    if (y.revenue > 0 && y.grossMargin < 0) {
      add({ id: `gm-${y.index}`, kind: 'calculated', severity: 'critical', title: bi(`Marge brute négative en ${y.label}`, `هامش إجمالي سالب سنة ${y.label}`),
        detail: bi('Le coût des ventes dépasse le chiffre d’affaires.', 'تكلفة المبيعات تتجاوز رقم المعاملات.'), refs: [{ key: 'cogs', fiscalYear: y.index }] });
    }
  }
  const firstProfit = x.years.find((y) => y.netIncome > 0);
  add({
    id: 'first-profit', kind: 'calculated', severity: 'info',
    title: firstProfit
      ? bi(`Premier exercice bénéficiaire : ${firstProfit.label}`, `أول سنة مالية رابحة: ${firstProfit.label}`)
      : bi('Aucun exercice bénéficiaire sur l’horizon', 'لا توجد سنة مالية رابحة خلال الأفق'),
    detail: firstProfit
      ? bi(`Résultat net ${mad(firstProfit.netIncome)}.`, `النتيجة الصافية ${mad(firstProfit.netIncome)}.`)
      : bi('Le projet reste déficitaire sur toute la durée étudiée.', 'يبقى المشروع عاجزاً طوال المدة المدروسة.'),
    refs: [{ key: 'netIncome' }],
  });
  if (x.peakFundingNeed.value && x.peakFundingNeed.value > 0) {
    const raised = x.totals.equityRaised + x.totals.loansRaised + x.totals.grants;
    add({
      id: 'funding', kind: 'calculated', severity: raised < x.peakFundingNeed.value ? 'warning' : 'info',
      title: bi(`Besoin de financement maximal : ${mad(x.peakFundingNeed.value)}`, `أقصى حاجة للتمويل: ${mad(x.peakFundingNeed.value)}`),
      detail: bi(`Ressources externes prévues : ${mad(raised)} (apports, emprunts, subventions).`, `الموارد الخارجية المتوقعة: ${mad(raised)}، مساهمات وقروض ومنح.`),
      refs: [{ key: 'cashBeforeFinancing', month: x.peakFundingNeed.month }],
    });
  }
  const lastCredit = M.vatCreditAsset.slice(Math.max(0, N - 12));
  if (N >= 24 && lastCredit.every((v) => v > 0)) {
    add({ id: 'vat-credit', kind: 'calculated', severity: 'warning', title: bi('Crédit de TVA structurel', 'دين ضريبي هيكلي على القيمة المضافة'),
      detail: bi(
        'Le crédit de TVA persiste sur les 12 derniers mois ; vérifier les taux de TVA. Le crédit d’exploitation n’est pas remboursable dans le cas général ; seul le remboursement de l’art. 103 bis sur investissements est modélisé (option à activer dans Hypothèses fiscales).',
        'يستمر دين الضريبة على القيمة المضافة خلال الأشهر الـ12 الأخيرة؛ تحقق من الأسعار. دين الاستغلال غير قابل للاسترداد في الحالة العامة؛ وحده استرداد المادة 103 مكرر على الاستثمارات منمذج، كخيار يُفعّل في الفرضيات الجبائية.',
      ), refs: [{ key: 'vatCreditAsset' }] });
  }
  const revTotal = x.totals.revenue;
  if (revTotal > 0) {
    for (const p of r.products) {
      const share = p.revenue.reduce((s, v) => s + v, 0) / revTotal;
      if (r.products.length > 1 && share > 0.8) {
        add({ id: `concentration-${p.id}`, kind: 'calculated', severity: 'info', title: bi('Concentration du chiffre d’affaires', 'تركز رقم المعاملات'),
          detail: bi(`« ${p.name} » représente ${pct(share, 0)} du CA.`, `«${p.name}» يمثل ${pct(share, 0)} من رقم المعاملات.`), refs: [{ key: 'revenue' }] });
      }
    }
    const payroll = M.salaries.reduce((s, v) => s + v, 0) + M.employerCharges.reduce((s, v) => s + v, 0);
    add({ id: 'payroll-share', kind: 'calculated', severity: 'info',
      title: bi(`Masse salariale : ${pct(payroll / revTotal, 1)} du CA`, `كتلة الأجور: ${pct(payroll / revTotal, 1)} من رقم المعاملات`),
      detail: bi('Coût employeur total rapporté au chiffre d’affaires de l’horizon.', 'التكلفة الإجمالية للمشغل منسوبة إلى رقم معاملات الأفق.'), refs: [{ key: 'salaries' }, { key: 'employerCharges' }] });
  }
  for (const p of model.products) {
    const high = p.volumeGrowthPct.find((g) => g > 50);
    if (high != null) {
      add({ id: `growth-${p.id}`, kind: 'assumption', severity: 'warning', title: bi(`Croissance saisie élevée pour « ${p.name} »`, `نمو مُدخل مرتفع لـ«${p.name}»`),
        detail: bi(`${formatPercent(high, 'fr', 0)} par an : hypothèse à justifier (étude de marché, contrats, historique).`, `${formatPercent(high, 'ar', 0)} سنوياً: فرضية يجب تبريرها بدراسة سوق أو عقود أو تاريخ.`), refs: [{ key: 'revenue' }] });
    }
    if (p.unitPrice > 0 && p.unitCost >= p.unitPrice) {
      add({ id: `price-${p.id}`, kind: 'assumption', severity: 'warning', title: bi(`Coût unitaire ≥ prix pour « ${p.name} »`, `التكلفة الوحدوية ≥ الثمن لـ«${p.name}»`),
        detail: bi('Chaque vente détruit de la marge.', 'كل عملية بيع تُفقد الهامش.'), refs: [{ key: 'cogs' }] });
    }
  }
  if (model.tax.localTaxes.length === 0 && model.tax.regime !== 'auto_entrepreneur') {
    add({ id: 'local-taxes', kind: 'assumption', severity: 'info', title: bi('Impôts locaux non saisis', 'الضرائب المحلية غير مُدخلة'),
      detail: bi(
        'Taxe professionnelle, taxe de services communaux et droits d’enregistrement ne sont pas calculés automatiquement : saisissez-les avec leur base légale.',
        'الرسم المهني ورسم الخدمات الجماعية وواجبات التسجيل لا تحسب تلقائياً: أدخلها مع سندها القانوني.',
      ), refs: [] });
  }
  for (const w of r.warnings) {
    if (w.code === 'is_assumed_unchanged' || w.code === 'is_rule_missing') {
      const rule = ruleById(w.code === 'is_assumed_unchanged' ? 'is-2026' : 'is-2023-2025');
      const ref = rule?.source?.reference ?? '';
      add({ id: `rule-${w.code}`, kind: 'assumption', severity: w.severity === 'error' ? 'critical' : 'info', title: bi('Règle fiscale à confirmer', 'قاعدة جبائية يجب تأكيدها'),
        detail: bi(`${w.message}${rule ? ` Référence : ${ref}.` : ''}`, `${w.messageAr}${rule ? ` المرجع: ${ref}.` : ''}`), refs: [{ key: 'incomeTax' }] });
    }
  }
  return out;
}
