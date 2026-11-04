'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { compareStudies, type ComparedStudy, type CompareRow } from '@/app/lib/business-studio/compare';
import { computeStudy } from '@/app/lib/business-studio/engine';
import { computeMetrics, type Unit } from '@/app/lib/business-studio/metrics';
import type { StudySummary } from '@/app/lib/business-studio/server-store';
import { ChartBox, groupedBarSpec } from './charts';
import { ApiError, studioApi } from './client';
import { bi, Card, LangToggle, Notice, useFormat, useStudio } from './ui';

async function loadCompared(id: string): Promise<ComparedStudy> {
  const s = await studioApi.get(id);
  const r = computeStudy(s.meta.model, s.meta.model.activeScenarioId);
  return { name: s.name, model: s.meta.model, r, x: computeMetrics(s.meta.model, r) };
}

export function Compare() {
  const { t, lang } = useStudio();
  const f = useFormat();
  const router = useRouter();
  const params = useSearchParams();
  const [list, setList] = useState<StudySummary[] | null>(null);
  const [ids, setIds] = useState<[string, string]>([params.get('a') ?? '', params.get('b') ?? '']);
  const [studies, setStudies] = useState<[ComparedStudy | null, ComparedStudy | null]>([null, null]);
  const [error, setError] = useState('');

  useEffect(() => {
    studioApi.list().then((l) => setList(l.filter((s) => s.kind === 'v2'))).catch((e) => setError(e instanceof ApiError ? e.code : 'network_error'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(ids.map((id) => (id ? loadCompared(id) : Promise.resolve(null))))
      .then((res) => { if (!cancelled) { setError(''); setStudies([res[0], res[1]]); } })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.code : 'network_error'); });
    return () => { cancelled = true; };
  }, [ids]);

  const pick = (side: 0 | 1, id: string) => {
    const next: [string, string] = side === 0 ? [id, ids[1]] : [ids[0], id];
    setIds(next);
    const q = new URLSearchParams();
    if (next[0]) q.set('a', next[0]);
    if (next[1]) q.set('b', next[1]);
    router.replace(`/etude-projet/compare${q.size ? `?${q}` : ''}`);
  };

  const [a, b] = studies;
  const cmp = useMemo(() => (a && b ? compareStudies(a, b) : null), [a, b]);

  const fmt = (unit: Unit, v: number | null, signed = false): string => {
    if (v == null) return t('notAvailable');
    const sign = signed && v > 0 ? '+' : '';
    switch (unit) {
      case 'mad': return `${sign}${f.mad(v)} ${t('mad')}`;
      case 'pct': return `${sign}${f.pct(v)}`;
      case 'ratio': return `${sign}${f.num(v, 2)}`;
      case 'months': return `${sign}${f.num(v)} ${lang === 'ar' ? 'شهر' : 'mois'}`;
      case 'years': return `${sign}${f.num(v, 1)} ${t('years')}`;
      default: return `${sign}${f.num(v)}`;
    }
  };
  const stronger = (row: CompareRow, side: 'a' | 'b') => {
    if (row.better == null || row.a == null || row.b == null || row.a === row.b) return false;
    const aWins = row.better === 'higher' ? row.a > row.b : row.a < row.b;
    return side === 'a' ? aWins : !aWins;
  };
  const yearLabels = cmp ? cmp.years.labels.map((l) => `${t(bi('Exercice', 'السنة'))} ${l}`) : [];

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/etude-projet" className="text-xs text-gray-500 hover:text-gray-800">← {t('studies')}</Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800">{t(bi('Comparer deux études', 'مقارنة دراستين'))}</h1>
        <LangToggle />
      </div>
      <Notice>{t(bi('Chaque étude est calculée avec ses propres hypothèses et son scénario actif. Les exercices sont alignés par rang (exercice 1, 2…).', 'تُحسب كل دراسة بفرضياتها الخاصة وسيناريوها النشط. السنوات مرتبة حسب الرتبة (السنة 1، 2…).'))}</Notice>
      {error && <Notice tone="critical">{error === 'not_found' ? t(bi('Étude introuvable ou accès refusé.', 'الدراسة غير موجودة أو الولوج مرفوض.')) : error}</Notice>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {([0, 1] as const).map((side) => (
          <label key={side} className="text-xs text-gray-600 flex flex-col gap-1">
            {side === 0 ? t(bi('Étude A', 'الدراسة أ')) : t(bi('Étude B', 'الدراسة ب'))}
            <select value={ids[side]} onChange={(e) => pick(side, e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
              <option value="">{list == null ? t('loading') : t(bi('Choisir une étude…', 'اختر دراسة…'))}</option>
              {(list ?? []).map((s) => <option key={s.id} value={s.id} disabled={s.id === ids[side === 0 ? 1 : 0]}>{s.name} — {s.years ?? '—'} {t('years')}</option>)}
            </select>
          </label>
        ))}
      </div>
      {cmp && a && b && (<>
        {cmp.notes.map((n, i) => <Notice key={i} tone="warning">{t(n)}</Notice>)}
        <Card title={t(bi('Indicateurs', 'المؤشرات'))}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <caption className="sr-only">{t(bi('Comparaison des indicateurs des deux études', 'مقارنة مؤشرات الدراستين'))}</caption>
              <thead><tr className="text-gray-500">
                <th scope="col" className="text-start py-1 pe-3">{t(bi('Indicateur', 'المؤشر'))}</th>
                <th scope="col" className="text-end px-2">A — {a.name}</th>
                <th scope="col" className="text-end px-2">B — {b.name}</th>
                <th scope="col" className="text-end px-2">{t(bi('Écart (B − A)', 'الفرق (ب − أ)'))}</th>
              </tr></thead>
              <tbody>{cmp.rows.map((row) => (
                <tr key={row.key} className="border-t border-gray-100">
                  <th scope="row" className="py-1 pe-3 text-start font-normal text-gray-700">{t(row.label)}</th>
                  {(['a', 'b'] as const).map((side) => (
                    <td key={side} className={`px-2 text-end tabular-nums ${stronger(row, side) ? 'font-semibold text-green-800' : ''}`} dir="ltr">
                      {fmt(row.unit, row[side])}{stronger(row, side) && <span className="sr-only"> ({t(bi('plus favorable', 'أفضل'))})</span>}
                    </td>
                  ))}
                  <td className="px-2 text-end tabular-nums text-gray-600" dir="ltr">{fmt(row.unit, row.diff, true)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartBox spec={groupedBarSpec(t(bi('Chiffre d’affaires par exercice', 'رقم المعاملات حسب السنة')), yearLabels, [{ name: `A — ${a.name}`, values: cmp.years.a.revenue }, { name: `B — ${b.name}`, values: cmp.years.b.revenue }], lang)} />
          <ChartBox spec={groupedBarSpec(t(bi('Résultat net par exercice', 'النتيجة الصافية حسب السنة')), yearLabels, [{ name: `A — ${a.name}`, values: cmp.years.a.netIncome }, { name: `B — ${b.name}`, values: cmp.years.b.netIncome }], lang)} />
          <ChartBox spec={groupedBarSpec(t(bi('Trésorerie en fin d’exercice', 'الخزينة في نهاية السنة')), yearLabels, [{ name: `A — ${a.name}`, values: cmp.years.a.cashEnd }, { name: `B — ${b.name}`, values: cmp.years.b.cashEnd }], lang)} />
          <ChartBox spec={groupedBarSpec(t(bi('DSCR par exercice', 'نسبة تغطية خدمة الدين حسب السنة')), yearLabels, [{ name: `A — ${a.name}`, values: cmp.years.a.dscr }, { name: `B — ${b.name}`, values: cmp.years.b.dscr }], lang, false)} />
        </div>
      </>)}
    </div>
  );
}
