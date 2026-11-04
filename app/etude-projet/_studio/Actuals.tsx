'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { alignActuals, variance, type ActualsByMonth } from '@/app/lib/business-studio/actuals';
import type { LineKey, StudyResult } from '@/app/lib/business-studio/engine';
import { monthLabel } from '@/app/lib/business-studio/i18n';
import { KEY_LABELS } from '@/app/lib/business-studio/statements';
import { ApiError, studioApi } from './client';
import { ChartBox, lineCompareSpec } from './charts';
import { bi, Button, Card, Notice, SelectField, Toggle, useFormat, useStudio } from './ui';

type Loaded = { actuals: ActualsByMonth; truncated: boolean; includeUnvalidated: boolean };

export function Actuals({ studyId, r, hasCompany }: { studyId: string; r: StudyResult; hasCompany: boolean }) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const [includeUnvalidated, setIncludeUnvalidated] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('todate');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await studioApi.actuals(studyId, includeUnvalidated)); } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.code : 'network_error');
    } finally { setLoading(false); }
  }, [studyId, includeUnvalidated]);

  useEffect(() => { if (hasCompany) void load(); }, [hasCompany, load]);

  const aligned = useMemo<ActualsByMonth | null>(() => (data ? alignActuals(data.actuals, r.calendar.labels) : null), [data, r]);

  const lastActual = useMemo(() => {
    if (!aligned) return -1;
    let last = -1;
    for (let m = 0; m < r.calendar.months; m += 1) {
      if (Object.values(aligned.series).some((s) => s[m] !== 0)) last = m;
    }
    return last;
  }, [aligned, r]);

  if (!hasCompany) {
    return <Notice tone="warning">{t(bi(
      'Cette étude n’est liée à aucune entreprise : le rapprochement avec la comptabilité réelle est indisponible. Créez l’étude depuis l’entreprise active pour l’activer.',
      'هذه الدراسة غير مرتبطة بأي مقاولة: المقارنة مع المحاسبة الفعلية غير متاحة. أنشئ الدراسة انطلاقاً من المقاولة النشطة لتفعيلها.',
    ))}</Notice>;
  }

  const fys = r.calendar.fiscalYears;
  const [from, to] = range === 'todate' ? [0, lastActual] : (() => { const y = fys[Number(range)]; return [y.firstMonth, y.firstMonth + y.months - 1]; })();
  const rows = aligned && to >= from ? variance(r, aligned, from, to) : [];
  const months = to >= from ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
  const labels = months.map((m) => monthLabel(r.calendar.labels[m], lang));
  const label = (key: string, fallback: string) => KEY_LABELS[key as LineKey]?.[lang] ?? fallback;

  return (
    <div className="space-y-4">
      <Notice>{t(bi(
        'Lecture seule : les écritures comptables de l’entreprise liée sont lues sans jamais être modifiées. Les prévisions de l’étude restent séparées de la comptabilité réelle. Correspondance par classes du plan comptable (classes 6 et 7).',
        'قراءة فقط: تُقرأ القيود المحاسبية للمقاولة المرتبطة دون أي تعديل. تبقى توقعات الدراسة منفصلة عن المحاسبة الفعلية. المطابقة حسب أصناف المخطط المحاسبي (الصنفان 6 و7).',
      ))}</Notice>
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Toggle label={t(bi('Inclure les écritures non validées', 'تضمين القيود غير المصادق عليها'))} checked={includeUnvalidated} onChange={setIncludeUnvalidated} />
          <SelectField label={t(bi('Période', 'الفترة'))} value={range} onChange={setRange}
            options={[{ value: 'todate', label: t(bi('Cumul à date', 'التراكم إلى اليوم')) }, ...fys.map((y, i) => ({ value: String(i), label: y.label }))]} />
          <Button size="sm" disabled={loading} onClick={() => void load()}>{loading ? t('loading') : t(bi('Actualiser', 'تحديث'))}</Button>
        </div>
      </Card>
      {error && <Notice tone="critical">{t(bi('Lecture de la comptabilité impossible', 'تعذرت قراءة المحاسبة'))} ({error})</Notice>}
      {data?.truncated && <Notice tone="warning">{t(bi('Plus de 50 000 écritures : seules les premières ont été lues.', 'أكثر من 50000 قيد: تمت قراءة الأولى فقط.'))}</Notice>}
      {includeUnvalidated && <Notice tone="warning">{t(bi('Les écritures non validées peuvent encore changer.', 'القيود غير المصادق عليها قابلة للتغيير.'))}</Notice>}
      {aligned && (aligned.lineCount === 0 || lastActual < 0) ? (
        <Notice>{t(bi('Aucune écriture comptable sur l’horizon de l’étude.', 'لا توجد قيود محاسبية خلال أفق الدراسة.'))}</Notice>
      ) : aligned && (<>
        <Card title={t(bi('Prévisionnel vs réalisé', 'التوقعات مقابل الإنجازات'))}>
          <p className="text-[11px] text-gray-500 mb-2">
            {t(bi(`${aligned.lineCount} lignes prises en compte, ${aligned.ignoredLines} ignorées (hors horizon ou statut exclu).`, `${aligned.lineCount} سطر محتسب، و${aligned.ignoredLines} مُهمل خارج الأفق أو بوضعية مستبعدة.`))}
            {months.length > 0 && ` ${labels[0]} → ${labels[labels.length - 1]}`}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead><tr className="text-gray-500">
                <th className="text-start py-1.5 pe-3">{t(bi('Poste', 'البند'))}</th>
                <th className="text-end px-2">{t(bi('Prévisionnel', 'المتوقع'))}</th>
                <th className="text-end px-2">{t(bi('Réalisé', 'المنجز'))}</th>
                <th className="text-end px-2">{t(bi('Écart', 'الفرق'))}</th>
                <th className="text-end px-2">%</th>
              </tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.key} className="border-t border-gray-100">
                  <td className="py-1.5 pe-3">{label(row.key, row.label)}</td>
                  <td className="px-2 text-end tabular-nums">{f.mad(row.forecast)}</td>
                  <td className="px-2 text-end tabular-nums">{f.mad(row.actual)}</td>
                  <td className={`px-2 text-end tabular-nums ${row.variance < 0 ? 'text-red-700' : ''}`}>{f.mad(row.variance)}</td>
                  <td className="px-2 text-end tabular-nums">{f.pct(row.variancePct)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">{t(bi('Montants HT en MAD. Écart = réalisé − prévisionnel.', 'المبالغ دون رسوم بالدرهم. الفرق = المنجز − المتوقع.'))}</p>
        </Card>
        {months.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartBox spec={lineCompareSpec(t(bi('Chiffre d’affaires mensuel', 'رقم المعاملات الشهري')), labels, [
              { name: t(bi('Prévisionnel', 'المتوقع')), values: months.map((m) => r.monthly.revenue[m]) },
              { name: t(bi('Réalisé', 'المنجز')), values: months.map((m) => aligned.series.revenue[m]) },
            ], lang)} />
            <ChartBox spec={lineCompareSpec(t(bi('Résultat net mensuel', 'النتيجة الصافية الشهرية')), labels, [
              { name: t(bi('Prévisionnel', 'المتوقع')), values: months.map((m) => r.monthly.netIncome[m]) },
              { name: t(bi('Réalisé', 'المنجز')), values: months.map((m) => aligned.series.netIncome[m]) },
            ], lang)} />
          </div>
        )}
      </>)}
    </div>
  );
}
