'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { computeWithLevers, mergeLevers } from '@/app/lib/business-studio/analysis';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import { monthLabel } from '@/app/lib/business-studio/i18n';
import type { Indicator, StudyMetrics } from '@/app/lib/business-studio/metrics';
import { NEUTRAL_LEVERS, newId, type Levers, type StudyModel } from '@/app/lib/business-studio/model';
import { LEVER_DEFS, UNIT_LABEL, useIndicator } from './analysis-ui';
import { ChartBox, groupedBarSpec, lineCompareSpec } from './charts';
import { bi, Button, Card, Notice, NumField, TextField, useFormat, useStudio } from './ui';

type Deltas = Partial<Levers>;

export function Simulator({ model, r, x, onChange, disabled }: {
  model: StudyModel; r: StudyResult; x: StudyMetrics; onChange: (m: StudyModel) => void; disabled: boolean;
}) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const { show, tip } = useIndicator(r);
  const [deltas, setDeltas] = useState<Deltas>({});
  const [scenarioName, setScenarioName] = useState('');
  const deferred = useDeferredValue(deltas);
  const active = model.scenarios.find((s) => s.id === model.activeScenarioId) ?? model.scenarios[0];

  const sim = useMemo(() => {
    try { return computeWithLevers(model, deferred, model.activeScenarioId); } catch { return null; }
  }, [model, deferred]);

  const changed = Object.values(deltas).some((v) => v != null && v !== 0);
  const setLever = (id: keyof Levers, v: number | null) => setDeltas((d) => ({ ...d, [id]: v }));

  const saveScenario = () => {
    const name = scenarioName.trim() || t(bi('Simulation', 'محاكاة'));
    const levers = mergeLevers(active?.levers ?? NEUTRAL_LEVERS, deltas);
    onChange({
      ...model,
      scenarios: [...model.scenarios, {
        id: newId('scn'), name, kind: 'custom', description: t(bi('Créé depuis le simulateur', 'أنشئ من المحاكي')),
        levers, parentId: active?.id ?? null, createdAt: new Date().toISOString(),
      }],
    });
    setScenarioName('');
  };

  type Row = { label: string; base: number | Indicator; sim: number | Indicator | undefined };
  const rows: Row[] = sim ? [
    { label: t('kpi_revenue'), base: x.totals.revenue, sim: sim.metrics.totals.revenue },
    { label: t('kpi_ebitda'), base: x.totals.ebitda, sim: sim.metrics.totals.ebitda },
    { label: t('kpi_netIncome'), base: x.totals.netIncome, sim: sim.metrics.totals.netIncome },
    { label: t('kpi_cashEnd'), base: x.cashEnd, sim: sim.metrics.cashEnd },
    { label: t('kpi_minCash'), base: x.minCash, sim: sim.metrics.minCash },
    { label: t('kpi_peak'), base: x.peakFundingNeed, sim: sim.metrics.peakFundingNeed },
    { label: t('kpi_npv'), base: x.npv, sim: sim.metrics.npv },
    { label: t('kpi_irr'), base: x.irrProject, sim: sim.metrics.irrProject },
    { label: t('kpi_irrEquity'), base: x.irrEquity, sim: sim.metrics.irrEquity },
    { label: t('kpi_payback'), base: x.payback, sim: sim.metrics.payback },
    { label: t('kpi_dscr'), base: x.minDscr, sim: sim.metrics.minDscr },
  ] : [];

  const cell = (v: number | Indicator | undefined) => (v == null ? t('notAvailable') : typeof v === 'number' ? `${f.mad(v)} ${t('mad')}` : show(v));
  const delta = (a: number | Indicator, b: number | Indicator | undefined): string => {
    if (b == null) return '';
    if (typeof a === 'number' && typeof b === 'number') return signed(f.mad(b - a), b - a);
    if (typeof a === 'number' || typeof b === 'number') return '';
    if (a.value == null || b.value == null || a.unit !== b.unit) return '—';
    const d = b.value - a.value;
    if (a.unit === 'mad') return signed(f.mad(d), d);
    if (a.unit === 'pct') return signed(`${f.num(d, 1)} ${lang === 'ar' ? 'نقطة' : 'pts'}`, d);
    if (a.unit === 'month_label' || a.unit === 'months') return signed(`${f.num(d)} ${lang === 'ar' ? 'شهر' : 'mois'}`, d);
    return signed(f.num(d, 2), d);
  };

  const monthLabels = r.calendar.labels.map((l) => monthLabel(l, lang));
  const yearLabels = x.years.map((y) => y.label);
  const charts = sim ? [
    lineCompareSpec(t(bi('Trésorerie mensuelle : scénario vs simulation', 'الخزينة الشهرية: السيناريو مقابل المحاكاة')), monthLabels, [
      { name: active?.name ?? t('scenario'), values: r.monthly.cash },
      { name: t(bi('Simulation', 'محاكاة')), values: sim.result.monthly.cash },
    ], lang),
    groupedBarSpec(t(bi('Résultat net par exercice', 'النتيجة الصافية حسب السنة المالية')), yearLabels, [
      { name: active?.name ?? t('scenario'), values: x.years.map((y) => y.netIncome) },
      { name: t(bi('Simulation', 'محاكاة')), values: sim.metrics.years.map((y) => y.netIncome) },
    ], lang),
    groupedBarSpec(t(bi('Chiffre d’affaires par exercice', 'رقم المعاملات حسب السنة المالية')), yearLabels, [
      { name: active?.name ?? t('scenario'), values: x.years.map((y) => y.revenue) },
      { name: t(bi('Simulation', 'محاكاة')), values: sim.metrics.years.map((y) => y.revenue) },
    ], lang),
  ] : [];

  return (
    <div className="space-y-4">
      <Notice>{t(bi(
        `Les leviers s’appliquent en plus du scénario actif « ${active?.name ?? ''} ». La simulation n’est pas enregistrée tant que vous ne la sauvegardez pas comme scénario.`,
        `تُطبق الروافع إضافة إلى السيناريو النشط «${active?.name ?? ''}». لا تُحفظ المحاكاة إلا إذا سجلتها كسيناريو.`,
      ))}</Notice>
      <Card title={t(bi('Leviers', 'الروافع'))} actions={<Button size="sm" variant="ghost" disabled={!changed} onClick={() => setDeltas({})}>{t(bi('Réinitialiser', 'إعادة الضبط'))}</Button>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3">
          {LEVER_DEFS.map((l) => {
            const v = (deltas[l.id] as number | undefined) ?? 0;
            const id = `lever-${l.id}`;
            return (
              <div key={l.id} className="flex flex-col gap-1">
                <label htmlFor={id} className="flex justify-between text-xs text-gray-600">
                  <span>{t(l.label)}</span>
                  <span className={`tabular-nums font-medium ${v === 0 ? 'text-gray-500' : 'text-gray-900'}`} dir="ltr">{v > 0 ? '+' : ''}{f.num(v, l.step < 1 ? 2 : 0)} {t(UNIT_LABEL[l.unit])}</span>
                </label>
                <input id={id} type="range" min={l.min} max={l.max} step={l.step} value={v}
                  onChange={(e) => setLever(l.id, Number(e.target.value))} className="w-full accent-[#1B2A4A]" />
              </div>
            );
          })}
          <NumField label={t(bi('Taux d’IS imposé (facultatif)', 'سعر الضريبة على الشركات المفروض (اختياري)'))} suffix="%" nullable min={0} max={100}
            value={deltas.isRateOverridePct ?? null} onChange={(v) => setLever('isRateOverridePct', v)}
            help={t(bi('Remplace le barème légal pour la simulation.', 'يعوض السلم القانوني في المحاكاة.'))} />
        </div>
      </Card>
      {!sim ? <Notice tone="critical">{t(bi('Simulation impossible avec ces valeurs.', 'المحاكاة غير ممكنة بهذه القيم.'))}</Notice> : (<>
        {!sim.result.checks.ok && <Notice tone="critical">{t('checksKo')}</Notice>}
        <Card title={t(bi('Comparaison', 'المقارنة'))}>
          <div className="overflow-x-auto rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" tabIndex={0}>
            <table className="min-w-full text-xs">
              <thead><tr className="text-gray-500">
                <th className="text-start py-1.5 pe-3">{t(bi('Indicateur', 'المؤشر'))}</th>
                <th className="text-end px-2">{active?.name ?? t('scenario')}</th>
                <th className="text-end px-2">{t(bi('Simulation', 'محاكاة'))}</th>
                <th className="text-end px-2">{t(bi('Écart', 'الفرق'))}</th>
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-gray-100" title={typeof row.sim === 'object' ? tip(row.sim) : undefined}>
                    <td className="py-1.5 pe-3 text-gray-700">{row.label}</td>
                    <td className="px-2 text-end tabular-nums">{cell(row.base)}</td>
                    <td className="px-2 text-end tabular-nums font-medium">{cell(row.sim)}</td>
                    <td className="px-2 text-end tabular-nums" dir="ltr">{delta(row.base, row.sim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {charts.map((c) => <ChartBox key={c.title} spec={c} />)}
        </div>
        <Card title={t(bi('Enregistrer comme scénario', 'حفظ كسيناريو'))}>
          <div className="flex flex-wrap items-end gap-3">
            <TextField label={t('name')} value={scenarioName} disabled={disabled} onChange={setScenarioName} maxLength={120} />
            <Button variant="primary" disabled={disabled || !changed} onClick={saveScenario}>{t(bi('Créer le scénario', 'إنشاء السيناريو'))}</Button>
          </div>
        </Card>
      </>)}
    </div>
  );
}

function signed(text: string, v: number): string {
  return v > 0 ? `+${text}` : text;
}
