'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import {
  compareScenarios, runStressTests, sensitivityMatrix, SENSITIVITY_LEVERS, STRESS_TESTS, tornado,
  type SensitivityMatrix, type SensitivityMetric, type StressResult, type TornadoBar,
} from '@/app/lib/business-studio/analysis';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import { monthLabel, scenarioText } from '@/app/lib/business-studio/i18n';
import { NEUTRAL_LEVERS, newId, type Levers, type Scenario, type StudyModel } from '@/app/lib/business-studio/model';
import { LEVER_DEFS, LEVER_LABEL, METRIC_LABEL, STRESS_LABEL, UNIT_LABEL, useIndicator } from './analysis-ui';
import { ChartBox, groupedBarSpec, lineCompareSpec, tornadoSpec } from './charts';
import { Badge, bi, Button, Card, Notice, NumField, SelectField, TextField, useFormat, useStudio } from './ui';

const KIND_LABEL: Record<Scenario['kind'], { fr: string; ar: string }> = {
  base: { fr: 'Base', ar: 'أساسي' }, optimistic: { fr: 'Optimiste', ar: 'متفائل' },
  pessimistic: { fr: 'Pessimiste', ar: 'متشائم' }, custom: { fr: 'Personnalisé', ar: 'مخصص' },
};

const MATRIX_STEPS: Record<'pct' | 'pts' | 'days' | 'months', number[]> = {
  pct: [-20, -10, 0, 10, 20], pts: [-2, -1, 0, 1, 2], days: [-30, -15, 0, 15, 30], months: [0, 3, 6, 9, 12],
};

export function Scenarios({ model, r, onChange, disabled }: { model: StudyModel; r: StudyResult; onChange: (m: StudyModel) => void; disabled: boolean }) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const { show, tip } = useIndicator(r);
  const [editing, setEditing] = useState(model.activeScenarioId);
  const deferredModel = useDeferredValue(model);
  const summaries = useMemo(() => {
    try { return compareScenarios(deferredModel); } catch { return []; }
  }, [deferredModel]);

  const setScenarios = (scenarios: Scenario[], activeScenarioId = model.activeScenarioId) => onChange({ ...model, scenarios, activeScenarioId });
  const updateScenario = (id: string, patch: Partial<Scenario>) => setScenarios(model.scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addScenario = (from?: Scenario) => {
    const s: Scenario = {
      id: newId('scn'), name: from ? `${from.name} — ${t(bi('copie', 'نسخة'))}` : t(bi('Nouveau scénario', 'سيناريو جديد')),
      kind: 'custom', description: from?.description ?? '', levers: { ...(from?.levers ?? NEUTRAL_LEVERS) }, parentId: from?.id ?? null, createdAt: new Date().toISOString(),
    };
    setScenarios([...model.scenarios, s]);
    setEditing(s.id);
  };
  const removeScenario = (id: string) => {
    setScenarios(model.scenarios.filter((s) => s.id !== id));
    if (editing === id) setEditing(model.activeScenarioId);
  };
  const current = model.scenarios.find((s) => s.id === editing) ?? model.scenarios[0];
  const setLever = (k: keyof Levers, v: number | null) => current && updateScenario(current.id, { levers: { ...current.levers, [k]: v } as Levers });

  const yearLabels = summaries[0]?.metrics.years.map((y) => y.label) ?? [];
  const monthLabels = r.calendar.labels.map((l) => monthLabel(l, lang));

  return (
    <div className="space-y-4">
      <Card title={t(bi('Scénarios', 'السيناريوهات'))} actions={<Button size="sm" disabled={disabled} onClick={() => addScenario()}>{t('add')}</Button>}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr className="text-gray-500">
              <th className="text-start py-1.5 pe-3">{t('name')}</th>
              <th className="text-start px-2">{t(bi('Type', 'النوع'))}</th>
              <th className="text-start px-2">{t(bi('Leviers modifiés', 'الروافع المعدلة'))}</th>
              <th className="text-end px-2">{t(bi('Actions', 'الإجراءات'))}</th>
            </tr></thead>
            <tbody>
              {model.scenarios.map((s) => {
                const moved = LEVER_DEFS.filter((l) => s.levers[l.id] !== 0).map((l) => `${t(l.label)} ${s.levers[l.id] > 0 ? '+' : ''}${s.levers[l.id]} ${t(UNIT_LABEL[l.unit])}`);
                if (s.levers.isRateOverridePct != null) moved.push(`IS ${s.levers.isRateOverridePct} %`);
                const isActive = s.id === model.activeScenarioId;
                return (
                  <tr key={s.id} className={`border-t border-gray-100 ${s.id === editing ? 'bg-amber-50/50' : ''}`}>
                    <td className="py-1.5 pe-3 font-medium">{scenarioText(s.name, lang)} {isActive && <Badge tone="green">{t(bi('Actif', 'نشط'))}</Badge>}</td>
                    <td className="px-2">{t(KIND_LABEL[s.kind])}</td>
                    <td className="px-2 text-gray-600 max-w-[420px]">{moved.length ? moved.join(' · ') : t(bi('Aucun (hypothèses saisies)', 'لا شيء (الفرضيات المدخلة)'))}</td>
                    <td className="px-2 text-end whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s.id)}>{t(bi('Modifier', 'تعديل'))}</Button>
                      <Button size="sm" variant="ghost" disabled={disabled || isActive} onClick={() => setScenarios(model.scenarios, s.id)}>{t(bi('Activer', 'تفعيل'))}</Button>
                      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => addScenario(s)}>{t('duplicate')}</Button>
                      <Button size="sm" variant="danger" disabled={disabled || isActive || s.kind === 'base'} onClick={() => removeScenario(s.id)}>{t('remove')}</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">{t(bi('Le scénario actif alimente le tableau de bord, les états et les rapports. Les leviers s’appliquent aux hypothèses saisies ; le scénario de base ne modifie rien.', 'السيناريو النشط يغذي لوحة القيادة والقوائم والتقارير. تُطبق الروافع على الفرضيات المدخلة؛ السيناريو الأساسي لا يغير شيئاً.'))}</p>
      </Card>

      {current && (
        <Card title={`${t(bi('Leviers du scénario', 'روافع السيناريو'))} — ${scenarioText(current.name, lang)}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <TextField label={t('name')} value={current.name} disabled={disabled} maxLength={120} onChange={(v) => updateScenario(current.id, { name: v })} />
            <TextField className="sm:col-span-1 lg:col-span-3" label={t(bi('Description et justification', 'الوصف والتبرير'))} value={current.description} disabled={disabled} onChange={(v) => updateScenario(current.id, { description: v })} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {LEVER_DEFS.map((l) => (
              <NumField key={`${current.id}-${l.id}`} label={t(l.label)} suffix={t(UNIT_LABEL[l.unit])} value={current.levers[l.id]}
                integer={l.unit === 'days' || l.unit === 'months'} disabled={disabled || current.kind === 'base'} onChange={(v) => v != null && setLever(l.id, v)} />
            ))}
            <NumField key={`${current.id}-is`} label={t(bi('Taux d’IS imposé', 'سعر الضريبة على الشركات المفروض'))} suffix="%" nullable min={0} max={100}
              value={current.levers.isRateOverridePct} disabled={disabled || current.kind === 'base'} onChange={(v) => setLever('isRateOverridePct', v)} />
          </div>
          {current.kind === 'base' && <p className="mt-2 text-[11px] text-gray-500">{t(bi('Le scénario de base reflète exactement les hypothèses : modifiez celles-ci dans l’onglet Hypothèses.', 'السيناريو الأساسي يعكس الفرضيات كما هي: عدلها في تبويب الفرضيات.'))}</p>}
        </Card>
      )}

      <Card title={t(bi('Comparaison des scénarios', 'مقارنة السيناريوهات'))}>
        {summaries.length === 0 ? <p className="text-xs text-gray-500">{t('emptyData')}</p> : (<>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead><tr className="text-gray-500">
                <th className="text-start py-1.5 pe-3">{t(bi('Indicateur', 'المؤشر'))}</th>
                {summaries.map((s) => <th key={s.id} className="text-end px-2">{scenarioText(s.name, lang)}</th>)}
              </tr></thead>
              <tbody>
                {([
                  [t('kpi_revenue'), (m) => `${f.mad(m.totals.revenue)}`],
                  [t('kpi_ebitda'), (m) => f.mad(m.totals.ebitda)],
                  [t('kpi_netIncome'), (m) => f.mad(m.totals.netIncome)],
                  [t('kpi_cashEnd'), (m) => show(m.cashEnd), (m) => tip(m.cashEnd)],
                  [t('kpi_minCash'), (m) => show(m.minCash), (m) => tip(m.minCash)],
                  [t('kpi_peak'), (m) => show(m.peakFundingNeed), (m) => tip(m.peakFundingNeed)],
                  [t('kpi_npv'), (m) => show(m.npv), (m) => tip(m.npv)],
                  [t('kpi_irr'), (m) => show(m.irrProject), (m) => tip(m.irrProject)],
                  [t('kpi_payback'), (m) => show(m.payback), (m) => tip(m.payback)],
                  [t('kpi_dscr'), (m) => show(m.minDscr), (m) => tip(m.minDscr)],
                ] as Array<[string, (m: (typeof summaries)[number]['metrics']) => string, ((m: (typeof summaries)[number]['metrics']) => string)?]>).map(([label, val, tipFn]) => (
                  <tr key={label} className="border-t border-gray-100">
                    <td className="py-1.5 pe-3 text-gray-700">{label}{label === t('kpi_revenue') || label === t('kpi_ebitda') || label === t('kpi_netIncome') ? ` (${t('mad')})` : ''}</td>
                    {summaries.map((s) => <td key={s.id} className="px-2 text-end tabular-nums" title={tipFn?.(s.metrics)}>{val(s.metrics)}</td>)}
                  </tr>
                ))}
                <tr className="border-t border-gray-100">
                  <td className="py-1.5 pe-3 text-gray-700">{t(bi('Contrôles d’équilibre', 'مراقبة التوازن'))}</td>
                  {summaries.map((s) => <td key={s.id} className="px-2 text-end">{s.result.checks.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">KO</Badge>}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
            <ChartBox spec={groupedBarSpec(t(bi('Résultat net par exercice', 'النتيجة الصافية حسب السنة المالية')), yearLabels,
              summaries.map((s) => ({ name: scenarioText(s.name, lang), values: s.metrics.years.map((y) => y.netIncome) })), lang)} />
            <ChartBox spec={lineCompareSpec(t(bi('Trésorerie mensuelle', 'الخزينة الشهرية')), monthLabels,
              summaries.map((s) => ({ name: scenarioText(s.name, lang), values: s.result.monthly.cash })), lang)} />
          </div>
        </>)}
      </Card>

      <SensitivityPanel model={model} />
      <StressPanel model={model} r={r} />
    </div>
  );
}

function useSnapshot<T>(model: StudyModel) {
  const [state, setState] = useState<{ for: StudyModel; value: T } | null>(null);
  return { value: state?.value ?? null, stale: state != null && state.for !== model, set: (value: T) => setState({ for: model, value }) };
}

function SensitivityPanel({ model }: { model: StudyModel }) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const [metric, setMetric] = useState<SensitivityMetric>('npv');
  const [rowLever, setRowLever] = useState<keyof Levers>('priceFactorPct');
  const [colLever, setColLever] = useState<keyof Levers>('volumeFactorPct');
  const [busy, setBusy] = useState(false);
  const tor = useSnapshot<{ metric: SensitivityMetric; bars: TornadoBar[] }>(model);
  const mat = useSnapshot<SensitivityMatrix>(model);
  const isPct = (m: SensitivityMetric) => m === 'irrProject';
  const fmt = (m: SensitivityMetric, v: number | null) => (v == null ? t('notAvailable') : isPct(m) ? f.pct(v) : f.mad(v));
  const leverOptions = SENSITIVITY_LEVERS.map((l) => ({ value: l.id, label: t(LEVER_LABEL[l.id as keyof typeof LEVER_LABEL]) }));
  const unitOf = (id: keyof Levers) => SENSITIVITY_LEVERS.find((l) => l.id === id)?.unit ?? 'pct';

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      try {
        tor.set({ metric, bars: tornado(model, metric) });
        mat.set(sensitivityMatrix(model, rowLever, colLever, MATRIX_STEPS[unitOf(rowLever)], MATRIX_STEPS[unitOf(colLever)], metric));
      } finally { setBusy(false); }
    }, 0);
  };

  const m = mat.value;
  const baseVal = m ? m.values[m.rows.indexOf(0)]?.[m.cols.indexOf(0)] ?? null : null;

  return (
    <Card title={t(bi('Sensibilité', 'الحساسية'))} actions={<Button size="sm" variant="primary" disabled={busy || rowLever === colLever} onClick={run}>{busy ? t('loading') : t(bi('Calculer', 'احسب'))}</Button>}>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <SelectField label={t(bi('Indicateur', 'المؤشر'))} value={metric} onChange={setMetric}
          options={(Object.keys(METRIC_LABEL) as SensitivityMetric[]).map((k) => ({ value: k, label: t(METRIC_LABEL[k]) }))} />
        <SelectField label={t(bi('Matrice : lignes', 'المصفوفة: الصفوف'))} value={rowLever} onChange={setRowLever} options={leverOptions} />
        <SelectField label={t(bi('Matrice : colonnes', 'المصفوفة: الأعمدة'))} value={colLever} onChange={setColLever} options={leverOptions} />
      </div>
      {(tor.stale || mat.stale) && <Notice tone="warning">{t(bi('Les hypothèses ont changé depuis le dernier calcul : relancez-le.', 'تغيرت الفرضيات منذ آخر حساب: أعد الحساب.'))}</Notice>}
      {!tor.value ? <p className="text-xs text-gray-500">{t(bi('Lancez le calcul pour obtenir le diagramme en tornade (chaque levier varié seul de ± un pas autour du scénario actif) et la matrice à deux variables.', 'شغل الحساب للحصول على مخطط الإعصار (تغيير كل رافعة وحدها حول السيناريو النشط) والمصفوفة ذات المتغيرين.'))}</p> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-2">
          <div>
            <ChartBox height={320} spec={tornadoSpec(`${t(bi('Tornade', 'الإعصار'))} — ${t(METRIC_LABEL[tor.value.metric])}`,
              tor.value.bars.map((b) => ({ label: `${t(LEVER_LABEL[b.lever.id as keyof typeof LEVER_LABEL])} (${b.low}/${b.high > 0 ? '+' : ''}${b.high} ${t(UNIT_LABEL[b.lever.unit])})`, low: b.valueLow, high: b.valueHigh, base: b.base })),
              lang, !isPct(tor.value.metric))} />
            <table className="min-w-full text-[11px] mt-2">
              <thead><tr className="text-gray-500"><th className="text-start">{t(bi('Levier', 'الرافعة'))}</th><th className="text-end">{t(bi('Bas', 'منخفض'))}</th><th className="text-end">{t(bi('Haut', 'مرتفع'))}</th></tr></thead>
              <tbody>{tor.value.bars.map((b) => (
                <tr key={b.lever.id} className="border-t border-gray-100">
                  <td>{t(LEVER_LABEL[b.lever.id as keyof typeof LEVER_LABEL])}</td>
                  <td className="text-end tabular-nums">{fmt(tor.value!.metric, b.valueLow)}</td>
                  <td className="text-end tabular-nums">{fmt(tor.value!.metric, b.valueHigh)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {m && (
            <div className="overflow-x-auto">
              <h4 className="text-sm font-semibold mb-2">{t(METRIC_LABEL[m.metric])} — {t(LEVER_LABEL[m.rowLever.id as keyof typeof LEVER_LABEL])} × {t(LEVER_LABEL[m.colLever.id as keyof typeof LEVER_LABEL])}</h4>
              <table className="text-xs border-collapse">
                <thead><tr>
                  <th className="p-1.5 border bg-gray-50" />
                  {m.cols.map((c) => <th key={c} className="p-1.5 border bg-gray-50 tabular-nums" dir="ltr">{c > 0 ? '+' : ''}{c} {t(UNIT_LABEL[m.colLever.unit])}</th>)}
                </tr></thead>
                <tbody>{m.rows.map((rv, i) => (
                  <tr key={rv}>
                    <th className="p-1.5 border bg-gray-50 tabular-nums" dir="ltr">{rv > 0 ? '+' : ''}{rv} {t(UNIT_LABEL[m.rowLever.unit])}</th>
                    {m.values[i].map((v, j) => {
                      const tone = v == null || baseVal == null ? 'bg-white' : v > baseVal ? 'bg-green-50 text-green-800' : v < baseVal ? 'bg-red-50 text-red-800' : 'bg-amber-50 font-semibold';
                      return <td key={j} className={`p-1.5 border text-end tabular-nums ${tone}`}>{fmt(m.metric, v)}</td>;
                    })}
                  </tr>
                ))}</tbody>
              </table>
              <p className="mt-1 text-[11px] text-gray-500">{t(bi('Variations appliquées en plus du scénario actif. Cellule centrale = scénario actif.', 'تغيرات تضاف إلى السيناريو النشط. الخلية المركزية = السيناريو النشط.'))}</p>
              {model.workingCapital.cashSalesPct >= 100 && (
                <p className="mt-1 text-[11px] text-gray-500">{t(bi('Ventes 100 % au comptant : le délai clients est sans effet.', 'المبيعات نقدية بنسبة 100 %: أجل الزبناء بدون أثر.'))}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StressPanel({ model, r }: { model: StudyModel; r: StudyResult }) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const [busy, setBusy] = useState(false);
  const snap = useSnapshot<StressResult[]>(model);
  const run = () => {
    setBusy(true);
    setTimeout(() => { try { snap.set(runStressTests(model)); } finally { setBusy(false); } }, 0);
  };
  return (
    <Card title={t(bi('Tests de résistance', 'اختبارات الصمود'))} actions={<Button size="sm" variant="primary" disabled={busy} onClick={run}>{busy ? t('loading') : t(bi('Calculer', 'احسب'))}</Button>}>
      <p className="text-[11px] text-gray-500 mb-2">{t(bi('Chocs hypothétiques appliqués au scénario actif pour tester la résilience ; ce ne sont pas des prévisions.', 'صدمات افتراضية تطبق على السيناريو النشط لاختبار الصمود؛ وليست توقعات.'))}</p>
      {model.workingCapital.cashSalesPct >= 100 && (
        <p className="text-[11px] text-gray-500 mb-2">{t(bi('Ventes 100 % au comptant : les chocs sur le délai clients sont sans effet (paramètre « Ventes au comptant », onglet BFR et trésorerie).', 'المبيعات نقدية بنسبة 100 %: صدمات أجل الزبناء بدون أثر (معلمة « المبيعات نقداً »، تبويب الاحتياج في رأس المال العامل والخزينة).'))}</p>
      )}
      {snap.stale && <Notice tone="warning">{t(bi('Les hypothèses ont changé depuis le dernier calcul : relancez-le.', 'تغيرت الفرضيات منذ آخر حساب: أعد الحساب.'))}</Notice>}
      {!snap.value ? <p className="text-xs text-gray-500">{STRESS_TESTS.map((s) => t(STRESS_LABEL[s.id] ?? { fr: s.label, ar: s.label })).join(' · ')}</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr className="text-gray-500">
              <th className="text-start py-1.5 pe-3">{t(bi('Choc', 'الصدمة'))}</th>
              <th className="text-end px-2">{t('kpi_netIncome')}</th>
              <th className="text-end px-2">{t('kpi_minCash')}</th>
              <th className="text-end px-2">{t('kpi_npv')}</th>
              <th className="text-end px-2">{t('kpi_dscr')}</th>
              <th className="text-start px-2">{t(bi('Alertes', 'التنبيهات'))}</th>
            </tr></thead>
            <tbody>{snap.value.map((s) => (
              <tr key={s.test.id} className="border-t border-gray-100">
                <td className="py-1.5 pe-3">{t(STRESS_LABEL[s.test.id] ?? { fr: s.test.label, ar: s.test.label })}</td>
                <td className="px-2 text-end tabular-nums">{f.mad(s.netIncome)}</td>
                <td className="px-2 text-end tabular-nums">{f.mad(s.minCash)}{s.minCashMonth != null ? ` (${monthLabel(r.calendar.labels[s.minCashMonth] ?? '', lang)})` : ''}</td>
                <td className="px-2 text-end tabular-nums">{f.mad(s.npv)}</td>
                <td className="px-2 text-end tabular-nums">{f.num(s.minDscr, 2)}</td>
                <td className="px-2 space-x-1 rtl:space-x-reverse">
                  {s.cashNegative && <Badge tone="red">{t(bi('Trésorerie négative', 'خزينة سالبة'))}</Badge>}
                  {s.dscrBelowOne && <Badge tone="red">{t(bi('DSCR < 1', 'DSCR < 1'))}</Badge>}
                  {s.equityNegative && <Badge tone="amber">{t(bi('Capitaux propres négatifs', 'أموال ذاتية سالبة'))}</Badge>}
                  {!s.cashNegative && !s.dscrBelowOne && !s.equityNegative && <Badge tone="green">OK</Badge>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-1 text-[11px] text-gray-500">{t(bi('Montants en MAD.', 'المبالغ بالدرهم.'))}</p>
        </div>
      )}
    </Card>
  );
}
