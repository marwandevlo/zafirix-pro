'use client';

import { useEffect, useRef } from 'react';
import type { Chart as ChartJs, ChartConfiguration, ChartDataset } from 'chart.js';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import type { LineKey } from '@/app/lib/business-studio/engine';
import { aggregate } from '@/app/lib/business-studio/metrics';
import type { StudyMetrics } from '@/app/lib/business-studio/metrics';
import type { StudyModel } from '@/app/lib/business-studio/model';
import { formatNumber, STR, type Bi, type Lang } from '@/app/lib/business-studio/i18n';
import { useStudio } from './ui';

export const PALETTE = ['#1B2A4A', '#D97706', '#059669', '#BE185D', '#2563EB', '#7C3AED', '#0891B2', '#65A30D', '#DC2626', '#64748B'];

export type ChartSpec = { config: ChartConfiguration; empty: boolean; title: string; summary: string };

/** Renders a chart.js chart; the library is loaded on the client only. */
export function ChartBox({ spec, height = 260 }: { spec: ChartSpec; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<ChartJs | null>(null);
  const { t } = useStudio();
  useEffect(() => {
    let cancelled = false;
    if (spec.empty) return;
    void import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !ref.current) return;
      chart.current?.destroy();
      chart.current = new Chart(ref.current, spec.config);
    });
    return () => { cancelled = true; chart.current?.destroy(); chart.current = null; };
  }, [spec]);
  return (
    <figure className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <figcaption className="mb-2 text-xs font-semibold text-gray-700">{spec.title}</figcaption>
      {spec.empty ? (
        <div className="flex items-center justify-center rounded-lg bg-gray-50 text-center text-xs text-gray-400 px-4" style={{ height }}>{t('emptyData')}</div>
      ) : (
        <div style={{ height }} className="relative" dir="ltr">
          <canvas ref={ref} role="img" aria-label={`${spec.title}. ${spec.summary}`} />
        </div>
      )}
    </figure>
  );
}

const toMad = (s: readonly number[]) => s.map((v) => v / 100);
const allZero = (...series: ReadonlyArray<readonly (number | null)[]>) => series.every((s) => s.every((v) => v == null || v === 0));
const sumKeys = (r: StudyResult, keys: LineKey[], g: 'year' | 'month' = 'year') => {
  const parts = keys.map((k) => aggregate(r, k, g));
  return parts[0].map((_, i) => parts.reduce((a, p) => a + p[i], 0));
};

function baseOptions(lang: Lang, opts: { stacked?: boolean; percent?: boolean; horizontal?: boolean; dualAxis?: boolean } = {}): ChartConfiguration['options'] {
  const fmt = (v: number | string) => (opts.percent ? `${formatNumber(Number(v), lang, 0)} %` : formatNumber(Number(v), lang));
  const valueAxis = { stacked: opts.stacked, ticks: { callback: fmt }, grid: { color: '#EEF2F7' } };
  const catAxis = { stacked: opts.stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    indexAxis: opts.horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label ?? ''}: ${fmt(Array.isArray(c.raw) ? (c.raw[1] as number) - (c.raw[0] as number) : (c.parsed[opts.horizontal ? 'x' : 'y'] as number))}` } },
    },
    scales: opts.horizontal
      ? { x: valueAxis, y: catAxis }
      : { x: catAxis, y: valueAxis, ...(opts.dualAxis ? { y1: { position: 'right', grid: { display: false }, ticks: { callback: (v: number | string) => formatNumber(Number(v), lang) } } } : {}) },
  } as ChartConfiguration['options'];
}

const ds = (label: string, data: (number | null)[], i: number, extra: Partial<ChartDataset> = {}): ChartDataset =>
  ({ label, data, backgroundColor: PALETTE[i % PALETTE.length], borderColor: PALETTE[i % PALETTE.length], borderWidth: 1.5, pointRadius: 0, ...extra }) as ChartDataset;

type Ctx = { r: StudyResult; x: StudyMetrics; model: StudyModel; lang: Lang };
const L = (b: Bi, lang: Lang) => b[lang];
const B = (fr: string, ar: string): Bi => ({ fr, ar });
const fyLabels = (r: StudyResult) => r.calendar.fiscalYears.map((f) => (f.partial ? `${f.label}*` : f.label));

export function dashboardCharts({ r, x, model, lang }: Ctx): ChartSpec[] {
  const years = fyLabels(r);
  const months = r.calendar.labels;
  const specs: ChartSpec[] = [];
  const push = (title: Bi, config: ChartConfiguration, empty: boolean, summary = '') => specs.push({ title: L(title, lang), config, empty, summary });

  const rev = x.years.map((y) => y.revenue / 100);
  const ebitda = x.years.map((y) => y.ebitda / 100);
  const net = x.years.map((y) => y.netIncome / 100);
  push(B('CA, EBE et résultat net par exercice', 'رقم المعاملات والفائض الإجمالي والنتيجة الصافية'), {
    type: 'bar', data: { labels: years, datasets: [ds(L(B('CA', 'رقم المعاملات'), lang), rev, 0), ds(L(B('EBE', 'الفائض الإجمالي'), lang), ebitda, 1), ds(L(B('Résultat net', 'النتيجة الصافية'), lang), net, 2)] },
    options: baseOptions(lang),
  }, allZero(rev, ebitda, net), `${years.length} exercices`);

  const cash = toMad(r.monthly.cash);
  const minCash = new Array(months.length).fill(model.workingCapital.minimumCash);
  push(B('Trésorerie nette fin de mois', 'الخزينة الصافية نهاية الشهر'), {
    type: 'line', data: { labels: months, datasets: [ds(L(B('Trésorerie', 'الخزينة'), lang), cash, 0, { fill: false }), ds(L(B('Trésorerie minimale souhaitée (saisie)', 'الحد الأدنى المرغوب للخزينة (مُدخل)'), lang), minCash, 8, { borderDash: [4, 4] })] },
    options: baseOptions(lang),
  }, allZero(cash));

  const cfo = toMad(r.monthly.cfo); const cfi = toMad(r.monthly.cfi); const cff = toMad(r.monthly.cff);
  push(B('Flux de trésorerie mensuels (exploitation, investissement, financement)', 'التدفقات النقدية الشهرية'), {
    type: 'bar', data: { labels: months, datasets: [ds(L(B('Exploitation', 'الاستغلال'), lang), cfo, 2), ds(L(B('Investissement', 'الاستثمار'), lang), cfi, 3), ds(L(B('Financement', 'التمويل'), lang), cff, 4)] },
    options: baseOptions(lang, { stacked: true }),
  }, allZero(cfo, cfi, cff));

  const fy = r.calendar.fiscalYears;
  const prodSeries = r.products.map((p) => fy.map((f) => p.revenue.slice(f.firstMonth, f.lastMonth + 1).reduce((a, v) => a + v, 0) / 100));
  push(B('Chiffre d’affaires par produit', 'رقم المعاملات حسب المنتج'), {
    type: 'bar', data: { labels: years, datasets: r.products.map((p, i) => ds(p.name, prodSeries[i], i)) },
    options: baseOptions(lang, { stacked: true }),
  }, prodSeries.length === 0 || allZero(...prodSeries));

  const total = (k: LineKey) => r.monthly[k].reduce((a, v) => a + v, 0) / 100;
  const costParts: Array<[Bi, number]> = [
    [B('Achats consommés', 'المشتريات المستهلكة'), total('cogs')], [B('Charges externes', 'التكاليف الخارجية'), total('externalCharges')],
    [B('Salaires', 'الأجور'), total('salaries')], [B('Charges sociales', 'التكاليف الاجتماعية'), total('employerCharges')],
    [B('Impôts et taxes', 'الضرائب والرسوم'), total('localTaxes')], [B('Dotations', 'المخصصات'), total('depreciation')],
    [B('Charges financières', 'التكاليف المالية'), total('financialCharges')], [B('Impôt sur le résultat', 'الضريبة على النتيجة'), total('incomeTax')],
  ];
  const costVals = costParts.map(([, v]) => Math.max(0, v));
  push(B('Structure des charges sur l’horizon', 'بنية التكاليف على مدى الأفق'), {
    type: 'doughnut', data: { labels: costParts.map(([b]) => L(b, lang)), datasets: [{ data: costVals, backgroundColor: PALETTE }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } },
  }, allZero(costVals));

  const gm = x.years.map((y) => y.grossMarginPct.value); const em = x.years.map((y) => y.ebitdaMarginPct.value); const nm = x.years.map((y) => y.netMarginPct.value);
  push(B('Marges en % du CA', 'الهوامش كنسبة من رقم المعاملات'), {
    type: 'line', data: { labels: years, datasets: [ds(L(B('Marge brute', 'الهامش الإجمالي'), lang), gm as number[], 0, { pointRadius: 3 }), ds(L(B('Taux d’EBE', 'نسبة الفائض الإجمالي'), lang), em as number[], 1, { pointRadius: 3 }), ds(L(B('Marge nette', 'الهامش الصافي'), lang), nm as number[], 2, { pointRadius: 3 })] },
    options: baseOptions(lang, { percent: true }),
  }, allZero(gm, em, nm));

  const be = x.years.map((y) => (y.breakEvenRevenue.value == null ? null : y.breakEvenRevenue.value / 100));
  push(B('CA réalisé vs CA critique (point mort)', 'رقم المعاملات المحقق مقابل رقم المعاملات الحرج'), {
    type: 'bar', data: { labels: years, datasets: [ds(L(B('CA', 'رقم المعاملات'), lang), rev, 0), ds(L(B('CA critique', 'رقم المعاملات الحرج'), lang), be as number[], 1)] },
    options: baseOptions(lang),
  }, allZero(rev));

  const wy = x.years.find((y) => !y.partial) ?? x.years[0];
  if (wy) {
    const S = (k: LineKey) => r.monthly[k].slice(wy.firstMonth, wy.lastMonth + 1).reduce((a, v) => a + v, 0) / 100;
    const steps: Array<[Bi, number]> = [
      [B('CA', 'رقم المعاملات'), S('revenue')], [B('Subventions d’exploitation', 'منح الاستغلال'), S('operatingGrants')], [B('Achats', 'المشتريات'), -S('cogs')],
      [B('Charges externes', 'التكاليف الخارجية'), -S('externalCharges')], [B('Impôts et taxes', 'الضرائب والرسوم'), -S('localTaxes')],
      [B('Personnel', 'المستخدمون'), -(S('salaries') + S('employerCharges'))], [B('Dotations', 'المخصصات'), -S('depreciation')],
      [B('Résultat financier', 'النتيجة المالية'), S('financialResult')], [B('Non courant', 'غير جاري'), S('nonCurrentResult')], [B('Impôt', 'الضريبة'), -S('incomeTax')],
    ];
    let run = 0;
    const bars = steps.map(([, v]) => { const from = run; run += v; return [from, run] as [number, number]; });
    bars.push([0, run]);
    push(B(`Du CA au résultat net — ${wy.label}`, `من رقم المعاملات إلى النتيجة الصافية — ${wy.label}`), {
      type: 'bar',
      data: { labels: [...steps.map(([b]) => L(b, lang)), L(B('Résultat net', 'النتيجة الصافية'), lang)], datasets: [{ label: wy.label, data: bars as unknown as number[], backgroundColor: bars.map((b, i) => (i === bars.length - 1 ? PALETTE[0] : b[1] >= b[0] ? PALETTE[2] : PALETTE[8])) }] },
      options: { ...baseOptions(lang), plugins: { legend: { display: false } } },
    }, allZero(steps.map(([, v]) => v)));
  }

  const sources = [x.totals.equityRaised, x.totals.loansRaised, x.totals.grants, x.totals.caf].map((v) => v / 100);
  const principal = r.monthly.cashOutPrincipal.reduce((a, v) => a + v, 0) / 100;
  const uses = [x.totals.capex / 100, x.totals.dividends / 100, principal];
  push(B('Ressources et emplois cumulés', 'الموارد والاستخدامات المتراكمة'), {
    type: 'bar',
    data: {
      labels: [L(B('Apports', 'المساهمات'), lang), L(B('Emprunts', 'القروض'), lang), L(B('Subventions', 'المنح'), lang), L(B('CAF', 'التمويل الذاتي'), lang), L(B('Investissements', 'الاستثمارات'), lang), L(B('Dividendes', 'الأرباح الموزعة'), lang), L(B('Remboursements', 'التسديدات'), lang)],
      datasets: [{ label: L(B('Montant', 'المبلغ'), lang), data: [...sources, ...uses], backgroundColor: [PALETTE[2], PALETTE[2], PALETTE[2], PALETTE[2], PALETTE[8], PALETTE[8], PALETTE[8]] }],
    },
    options: { ...baseOptions(lang, { horizontal: true }), plugins: { legend: { display: false } } },
  }, allZero(sources, uses));

  const debtService = x.years.map((y) => y.debtService / 100);
  const debtEnd = x.years.map((y) => y.loansEnd / 100);
  push(B('Service de la dette et encours', 'خدمة الدين والرصيد القائم'), {
    type: 'bar', data: { labels: years, datasets: [ds(L(B('Service de la dette', 'خدمة الدين'), lang), debtService, 1), { ...ds(L(B('Encours fin d’exercice', 'الرصيد نهاية السنة'), lang), debtEnd, 0), type: 'line' } as ChartDataset] },
    options: baseOptions(lang),
  }, allZero(debtService, debtEnd));

  const bfr = toMad(r.monthly.bfr);
  push(B('Besoin en fonds de roulement', 'الاحتياج من رأس المال العامل'), {
    type: 'line', data: { labels: months, datasets: [ds('BFR', bfr, 5, { fill: false })] }, options: baseOptions(lang),
  }, allZero(bfr));

  const payroll = toMad(sumKeys(r, ['salaries', 'employerCharges']));
  const hc = r.calendar.fiscalYears.map((f) => r.monthly.headcount[f.lastMonth]);
  push(B('Masse salariale et effectif', 'كتلة الأجور وعدد المستخدمين'), {
    type: 'bar', data: { labels: years, datasets: [ds(L(B('Coût du personnel', 'تكلفة المستخدمين'), lang), payroll, 0), { ...ds(L(B('Effectif fin d’exercice', 'العدد نهاية السنة'), lang), hc, 1), type: 'line', yAxisID: 'y1', pointRadius: 3 } as ChartDataset] },
    options: baseOptions(lang, { dualAxis: true }),
  }, allZero(payroll, hc));

  const vatC = toMad(aggregate(r, 'vatCollectedDue', 'year')); const vatD = toMad(aggregate(r, 'vatDeductible', 'year')); const vatP = toMad(aggregate(r, 'cashOutVat', 'year'));
  push(B('TVA collectée, déductible et versée', 'الضريبة على القيمة المضافة المحصلة والقابلة للخصم والمؤداة'), {
    type: 'bar', data: { labels: years, datasets: [ds(L(B('Collectée', 'المحصلة'), lang), vatC, 0), ds(L(B('Déductible', 'القابلة للخصم'), lang), vatD, 2), ds(L(B('Versée', 'المؤداة'), lang), vatP, 1)] },
    options: baseOptions(lang),
  }, allZero(vatC, vatD, vatP));

  const taxes = [...new Set(r.taxPayments.map((p) => p.tax))];
  const taxSeries = taxes.map((tax) => fy.map((f) => r.taxPayments.filter((p) => p.tax === tax && p.month >= f.firstMonth && p.month <= f.lastMonth).reduce((a, p) => a + p.amount, 0) / 100));
  push(B('Décaissements fiscaux et sociaux', 'المدفوعات الجبائية والاجتماعية'), {
    type: 'bar', data: { labels: years, datasets: taxes.map((tax, i) => ds(tax, taxSeries[i], i)) }, options: baseOptions(lang, { stacked: true }),
  }, taxSeries.length === 0 || allZero(...taxSeries));

  const E = (k: LineKey) => fy.map((f) => r.monthly[k][f.lastMonth] / 100);
  const curAssets = fy.map((f) => (r.monthly.totalAssets[f.lastMonth] - r.monthly.fixedAssetsNet[f.lastMonth] - r.monthly.cashAsset[f.lastMonth]) / 100);
  const curLiab = fy.map((f) => (r.monthly.totalLiabilitiesAndEquity[f.lastMonth] - r.monthly.equity[f.lastMonth] - r.monthly.loans[f.lastMonth]) / 100);
  push(B('Structure du bilan en fin d’exercice', 'بنية الميزانية في نهاية السنة'), {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        ds(L(B('Immobilisations nettes', 'الأصول الثابتة الصافية'), lang), E('fixedAssetsNet'), 0, { stack: 'a' }), ds(L(B('Actif circulant', 'الأصول المتداولة'), lang), curAssets, 4, { stack: 'a' }), ds(L(B('Trésorerie', 'الخزينة'), lang), E('cashAsset'), 2, { stack: 'a' }),
        ds(L(B('Capitaux propres', 'الأموال الذاتية'), lang), E('equity'), 5, { stack: 'p' }), ds(L(B('Dettes de financement', 'ديون التمويل'), lang), E('loans'), 1, { stack: 'p' }), ds(L(B('Passif circulant', 'الخصوم المتداولة'), lang), curLiab, 9, { stack: 'p' }),
      ],
    },
    options: baseOptions(lang, { stacked: true }),
  }, allZero(E('totalAssets')));

  let acc = 0;
  const cumFcff = r.monthly.fcff.map((v) => (acc += v) / 100);
  push(B('FCFF cumulés (délai de récupération)', 'التدفقات الحرة المتراكمة (مدة الاسترداد)'), {
    type: 'line', data: { labels: months, datasets: [ds('FCFF', cumFcff, 3, { fill: false })] }, options: baseOptions(lang),
  }, allZero(cumFcff));

  const capex = toMad(aggregate(r, 'capexCost', 'year')); const dep = toMad(aggregate(r, 'depreciation', 'year'));
  push(B('Investissements et dotations aux amortissements', 'الاستثمارات ومخصصات الاهتلاك'), {
    type: 'bar', data: { labels: years, datasets: [ds(L(B('Investissements', 'الاستثمارات'), lang), capex, 0), ds(L(B('Dotations', 'المخصصات'), lang), dep, 1)] }, options: baseOptions(lang),
  }, allZero(capex, dep));

  const dscr = x.years.map((y) => y.dscr.value);
  push(B('DSCR par exercice (repère de marché 1,2)', 'نسبة تغطية خدمة الدين (مرجع السوق 1.2)'), {
    type: 'line', data: { labels: years, datasets: [ds('DSCR', dscr as number[], 0, { pointRadius: 3 }), ds(L(B('Repère 1,2 (pratique de marché)', 'مرجع 1.2 (ممارسة سوقية)'), lang), years.map(() => 1.2), 8, { borderDash: [4, 4] })] },
    options: baseOptions(lang),
  }, dscr.every((v) => v == null));

  if (x.saas) {
    const s = x.saas;
    push(B('SaaS : MRR et abonnés', 'الاشتراكات: الإيراد الشهري المتكرر والمشتركون'), {
      type: 'bar', data: { labels: months, datasets: [ds(L(B('Abonnés', 'المشتركون'), lang), s.subscribers, 4, { yAxisID: 'y1' }), { ...ds('MRR', toMad(s.mrr), 0), type: 'line' } as ChartDataset] },
      options: baseOptions(lang, { dualAxis: true }),
    }, allZero(s.mrr, s.subscribers));
  }
  return specs;
}

export function lineCompareSpec(title: string, labels: string[], series: Array<{ name: string; values: number[] }>, lang: Lang): ChartSpec {
  return {
    title, summary: '', empty: series.every((s) => allZero(s.values)),
    config: { type: 'line', data: { labels, datasets: series.map((s, i) => ds(s.name, toMad(s.values), i, { fill: false })) }, options: baseOptions(lang) },
  };
}

export function groupedBarSpec(title: string, labels: string[], series: Array<{ name: string; values: (number | null)[] }>, lang: Lang, cents = true): ChartSpec {
  return {
    title, summary: '', empty: series.every((s) => allZero(s.values)),
    config: { type: 'bar', data: { labels, datasets: series.map((s, i) => ds(s.name, s.values.map((v) => (v == null ? null : cents ? v / 100 : v)), i)) }, options: baseOptions(lang) },
  };
}

/** Rows whose low or high value is not computable are drawn without that bar. */
export function tornadoSpec(title: string, rows: Array<{ label: string; low: number | null; high: number | null; base: number | null }>, lang: Lang, cents = true): ChartSpec {
  const scale = (v: number) => (cents ? v / 100 : v);
  const baseRaw = rows[0]?.base ?? null;
  const base = baseRaw == null ? 0 : scale(baseRaw);
  const bar = (v: number | null) => (v == null || baseRaw == null ? null : [base, scale(v)]);
  return {
    title, summary: '', empty: rows.length === 0 || baseRaw == null || rows.every((r) => r.low == null && r.high == null),
    config: {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          { label: lang === 'ar' ? 'تغير منخفض' : 'Variation basse', data: rows.map((r) => bar(r.low)) as unknown as number[], backgroundColor: PALETTE[8] },
          { label: lang === 'ar' ? 'تغير مرتفع' : 'Variation haute', data: rows.map((r) => bar(r.high)) as unknown as number[], backgroundColor: PALETTE[2] },
        ],
      },
      options: { ...baseOptions(lang, { horizontal: true }), scales: { x: { ticks: { callback: (v: number | string) => formatNumber(Number(v), lang) } }, y: { stacked: true } } } as ChartConfiguration['options'],
    },
  };
}

export function riskMatrixSpec(title: string, risks: StudyModel['risks'], lang: Lang): ChartSpec {
  return {
    title, summary: '', empty: risks.length === 0,
    config: {
      type: 'bubble',
      data: { datasets: risks.map((r, i) => ({ label: r.title || '—', data: [{ x: r.likelihood, y: r.impact, r: 4 + r.likelihood * r.impact * 0.8 }], backgroundColor: `${PALETTE[i % PALETTE.length]}AA` })) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { min: 0, max: 6, title: { display: true, text: lang === 'ar' ? 'الاحتمال' : 'Probabilité' }, ticks: { stepSize: 1 } },
          y: { min: 0, max: 6, title: { display: true, text: lang === 'ar' ? 'الأثر' : 'Impact' }, ticks: { stepSize: 1 } },
        },
      },
    },
  };
}

export const notAvailable = (lang: Lang) => STR.notAvailable[lang];
