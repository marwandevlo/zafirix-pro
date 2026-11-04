'use client';

import { useMemo, useState } from 'react';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import type { Granularity } from '@/app/lib/business-studio/metrics';
import { STATEMENTS, statementTable, type StatementId } from '@/app/lib/business-studio/statements';
import { monthLabel } from '@/app/lib/business-studio/i18n';
import { bi, Card, Notice, SelectField, Toggle, useFormat, useStudio } from './ui';

const ORDER: StatementId[] = ['cpc', 'sig', 'bilan_actif', 'bilan_passif', 'tft', 'tresorerie', 'financement', 'bfr', 'tva', 'is', 'paie', 'dette', 'investissements'];

export function Statements({ r }: { r: StudyResult }) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const [id, setId] = useState<StatementId>('cpc');
  const [g, setG] = useState<Granularity>('year');
  const [fy, setFy] = useState(0);
  const [showFormula, setShowFormula] = useState(false);

  const table = useMemo(() => statementTable(r, id, g, lang), [r, id, g, lang]);
  const fiscalYears = r.calendar.fiscalYears;
  const fyIndex = Math.min(fy, fiscalYears.length - 1);
  const detailed = g === 'month' || g === 'quarter';
  const visible = table.periods
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      if (!detailed) return true;
      const y = fiscalYears[fyIndex];
      return p.months.some((m) => m >= y.firstMonth && m < y.firstMonth + y.months);
    });

  const periodLabel = (label: string, i: number) => {
    if (g === 'horizon_year') return `${t('year')} ${i + 1}`;
    if (g === 'month') return monthLabel(label, lang);
    return label;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label={t(bi('État', 'القائمة'))} value={id} onChange={(v) => setId(v as StatementId)}
            options={ORDER.map((s) => ({ value: s, label: STATEMENTS[s].title[lang] }))} />
          <SelectField label={t(bi('Périodicité', 'الدورية'))} value={g} onChange={(v) => setG(v as Granularity)}
            options={[
              { value: 'month', label: t('monthly') }, { value: 'quarter', label: t('quarterly') },
              { value: 'year', label: t(bi('Par exercice', 'حسب السنة المالية')) }, { value: 'horizon_year', label: t(bi('Années de projet (12 mois)', 'سنوات المشروع (12 شهراً)')) },
            ]} />
          {detailed && (
            <SelectField label={t(bi('Exercice', 'السنة المالية'))} value={String(fyIndex)} onChange={(v) => setFy(Number(v))}
              options={fiscalYears.map((y, i) => ({ value: String(i), label: `${y.label}${y.partial ? ` (${t('partial')})` : ''}` }))} />
          )}
          <Toggle label={t(bi('Afficher les formules', 'عرض الصيغ'))} checked={showFormula} onChange={setShowFormula} />
        </div>
      </Card>
      {table.periods.some((p) => p.partial) && (
        <Notice>{t(bi('* Période partielle (exercice ou trimestre incomplet dans l’horizon).', '* فترة جزئية (سنة مالية أو فصل غير مكتمل داخل الأفق).'))}</Notice>
      )}
      <Card title={`${table.title[lang]} — ${t('mad')}`}>
        <div className="overflow-x-auto max-h-[70vh] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" tabIndex={0}>
          <table className="min-w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th scope="col" className="sticky start-0 z-20 bg-white text-start px-2 py-2 border-b font-semibold min-w-[220px]">{t(bi('Poste', 'البند'))}</th>
                {showFormula && <th scope="col" className="px-2 py-2 border-b text-start font-semibold min-w-[200px]">{t(bi('Formule', 'الصيغة'))}</th>}
                {visible.map(({ p, i }) => (
                  <th key={p.key} scope="col" className="px-2 py-2 border-b text-end font-semibold whitespace-nowrap">{periodLabel(p.label, i)}{p.partial ? '*' : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => {
                const s = row.def.style;
                const strong = s === 'subtotal' || s === 'total';
                const rowCls = s === 'section' ? 'bg-gray-50 font-semibold text-gray-800' : s === 'total' ? 'bg-blue-50 font-bold' : strong ? 'font-semibold' : s === 'detail' ? 'text-gray-500' : '';
                return (
                  <tr key={row.def.id} className={rowCls}>
                    <th scope="row" title={row.formula || undefined}
                      className={`sticky start-0 bg-inherit text-start px-2 py-1.5 border-b font-[inherit] ${s === 'detail' ? 'ps-6' : ''} ${s === 'section' ? '' : 'bg-white'}`}>
                      {row.def.label[lang]}
                      {row.def.note && <span className="block text-[10px] font-normal text-gray-500">{row.def.note[lang]}</span>}
                    </th>
                    {showFormula && <td className="px-2 py-1.5 border-b text-[10px] text-gray-500">{row.formula}</td>}
                    {visible.map(({ p, i }) => {
                      const v = row.values[i];
                      const txt = v == null ? '' : row.isCount ? f.num(v) : f.mad(v);
                      return <td key={p.key} className={`px-2 py-1.5 border-b text-end tabular-nums whitespace-nowrap ${v != null && v < 0 ? 'text-red-600' : ''}`}>{txt}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">{t(bi('Flux sommés sur la période ; soldes de bilan à la clôture de la période. Montants hors TVA sauf mention contraire.', 'التدفقات مجموعة على الفترة؛ أرصدة الميزانية عند إقفال الفترة. المبالغ دون احتساب الضريبة على القيمة المضافة ما لم يُذكر خلاف ذلك.'))}</p>
      </Card>
    </div>
  );
}
