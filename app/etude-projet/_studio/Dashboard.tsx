'use client';

import { useMemo } from 'react';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import { monthLabel } from '@/app/lib/business-studio/i18n';
import type { StudyMetrics } from '@/app/lib/business-studio/metrics';
import type { StudyModel } from '@/app/lib/business-studio/model';
import { sectorKpis } from '@/app/lib/business-studio/sectors';
import { useIndicator } from './analysis-ui';
import { ChartBox, dashboardCharts } from './charts';
import { bi, Card, KpiCard, Notice, useFormat, useStudio } from './ui';

export function Dashboard({ model, r, x }: { model: StudyModel; r: StudyResult; x: StudyMetrics }) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const charts = useMemo(() => dashboardCharts({ r, x, model, lang }), [r, x, model, lang]);
  const kpis = useMemo(() => sectorKpis(model, r, x), [model, r, x]);
  const first = x.years[0];
  const last = x.years[x.years.length - 1];

  const { show, tip } = useIndicator(r);
  const tone = (v: number | null | undefined) => (v == null ? 'default' : v < 0 ? 'bad' : 'default') as 'default' | 'bad';

  const cards: Array<{ label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'bad' | 'warn'; title?: string }> = [
    { label: t('kpi_revenue'), value: `${f.mad(x.totals.revenue)} ${t('mad')}` },
    { label: t('kpi_ebitda'), value: `${f.mad(x.totals.ebitda)} ${t('mad')}`, tone: tone(x.totals.ebitda) },
    { label: t('kpi_netIncome'), value: `${f.mad(x.totals.netIncome)} ${t('mad')}`, tone: tone(x.totals.netIncome) },
    { label: t('kpi_caf'), value: `${f.mad(x.totals.caf)} ${t('mad')}`, tone: tone(x.totals.caf) },
    { label: t('kpi_cashEnd'), value: show(x.cashEnd), tone: tone(x.cashEnd.value), title: tip(x.cashEnd) },
    { label: t('kpi_minCash'), value: show(x.minCash), hint: x.minCash.month != null ? monthLabel(r.calendar.labels[x.minCash.month], lang) : undefined, tone: (x.minCash.value ?? 0) < 0 ? 'bad' : 'default', title: tip(x.minCash) },
    { label: t('kpi_peak'), value: show(x.peakFundingNeed), hint: x.peakFundingNeed.month != null ? monthLabel(r.calendar.labels[x.peakFundingNeed.month], lang) : undefined, title: tip(x.peakFundingNeed) },
    { label: t('kpi_npv'), value: show(x.npv), tone: tone(x.npv.value), hint: `${model.general.discountRatePct} %`, title: tip(x.npv) },
    { label: t('kpi_irr'), value: show(x.irrProject), title: tip(x.irrProject) },
    { label: t('kpi_irrEquity'), value: show(x.irrEquity), title: tip(x.irrEquity) },
    { label: t('kpi_payback'), value: show(x.payback), title: tip(x.payback) },
    { label: t('kpi_roi'), value: show(x.roi), title: tip(x.roi) },
    { label: t('kpi_dscr'), value: show(x.minDscr), tone: x.minDscr.value != null && x.minDscr.value < 1 ? 'bad' : x.minDscr.value != null && x.minDscr.value < 1.2 ? 'warn' : 'default', title: tip(x.minDscr) },
    { label: t('kpi_breakEven'), value: first ? show(first.breakEvenRevenue) : t('notAvailable'), hint: first && first.breakEvenMonth.value != null ? show(first.breakEvenMonth) : undefined, title: first ? tip(first.breakEvenRevenue) : undefined },
    { label: t('kpi_grossMargin'), value: last ? show(last.grossMarginPct) : t('notAvailable'), title: last ? tip(last.grossMarginPct) : undefined },
    { label: t('kpi_capex'), value: `${f.mad(x.totals.capex)} ${t('mad')}` },
    { label: t('kpi_headcount'), value: f.num(last?.headcountEnd ?? 0, 1) },
  ];

  return (
    <div className="space-y-4">
      {r.checks.ok ? <Notice tone="success">{t('checksOk')}</Notice> : <Notice tone="critical">{t('checksKo')}</Notice>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {cards.map((c) => <KpiCard key={c.label} {...c} />)}
      </div>
      <p className="text-[11px] text-gray-400">{t(bi('Survolez un indicateur pour voir sa formule. « n.d. » : indicateur non calculable (raison indiquée dans l’infobulle).', 'مرر المؤشر لرؤية صيغته. «غ.م.»: مؤشر غير قابل للحساب (السبب في التلميح).'))}</p>
      {r.warnings.length > 0 && (
        <Card title={t(bi('Avertissements du moteur', 'تنبيهات المحرك'))}>
          <ul className="space-y-1 text-xs">
            {r.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className={w.severity === 'error' ? 'text-red-700' : w.severity === 'warning' ? 'text-amber-800' : 'text-gray-600'}>
                {w.month != null ? `${monthLabel(r.calendar.labels[w.month] ?? '', lang)} — ` : ''}{w.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {charts.map((spec) => <ChartBox key={spec.title} spec={spec} />)}
      </div>
      {kpis.length > 0 && (
        <Card title={t(bi('Indicateurs sectoriels', 'المؤشرات القطاعية'))}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead><tr className="text-gray-500"><th className="text-start py-1 pe-3">{t(bi('Indicateur', 'المؤشر'))}</th>{x.years.map((y) => <th key={y.index} className="text-end px-2">{y.label}</th>)}</tr></thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.id} className="border-t border-gray-100" title={[k.formula, k.reason].filter(Boolean).join(' — ')}>
                    <td className="py-1 pe-3 text-gray-700">{k.label}</td>
                    {k.values.map((v, i) => (
                      <td key={i} className="px-2 text-end tabular-nums" dir="ltr">
                        {v == null ? t('notAvailable') : k.unit === 'mad' ? f.mad(v) : k.unit === 'pct' ? f.pct(v) : k.unit === 'ratio' ? f.num(v, 2) : f.num(v, 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
