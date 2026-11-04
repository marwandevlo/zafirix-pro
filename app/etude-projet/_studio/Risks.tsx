'use client';

import { useMemo } from 'react';
import { findings, type FindingKind } from '@/app/lib/business-studio/analysis';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import type { StudyMetrics } from '@/app/lib/business-studio/metrics';
import { newRisk, type StudyModel } from '@/app/lib/business-studio/model';
import { ChartBox, riskMatrixSpec } from './charts';
import { Badge, bi, Card, ListEditor, Notice, SelectField, StringListEditor, TextArea, TextField, useStudio } from './ui';

const CATEGORIES = [
  { value: 'market', label: { fr: 'Marché', ar: 'السوق' } },
  { value: 'operational', label: { fr: 'Opérationnel', ar: 'تشغيلي' } },
  { value: 'financial', label: { fr: 'Financier', ar: 'مالي' } },
  { value: 'regulatory', label: { fr: 'Réglementaire', ar: 'تنظيمي' } },
  { value: 'technical', label: { fr: 'Technique', ar: 'تقني' } },
  { value: 'human', label: { fr: 'Humain', ar: 'بشري' } },
  { value: 'other', label: { fr: 'Autre', ar: 'أخرى' } },
];

const SCALE = [1, 2, 3, 4, 5];

const SWOT_KEYS = [
  ['strengths', { fr: 'Forces', ar: 'نقاط القوة' }],
  ['weaknesses', { fr: 'Faiblesses', ar: 'نقاط الضعف' }],
  ['opportunities', { fr: 'Opportunités', ar: 'الفرص' }],
  ['threats', { fr: 'Menaces', ar: 'التهديدات' }],
] as const;

const PESTEL_KEYS = [
  ['political', { fr: 'Politique', ar: 'سياسي' }],
  ['economic', { fr: 'Économique', ar: 'اقتصادي' }],
  ['social', { fr: 'Socioculturel', ar: 'اجتماعي وثقافي' }],
  ['technological', { fr: 'Technologique', ar: 'تكنولوجي' }],
  ['environmental', { fr: 'Environnemental', ar: 'بيئي' }],
  ['legal', { fr: 'Légal', ar: 'قانوني' }],
] as const;

const KIND: Record<FindingKind, { label: { fr: string; ar: string }; tone: 'blue' | 'amber' | 'gray' }> = {
  calculated: { label: { fr: 'Calculé', ar: 'محسوب' }, tone: 'blue' },
  assumption: { label: { fr: 'Hypothèse saisie', ar: 'فرضية مدخلة' }, tone: 'amber' },
  convention: { label: { fr: 'Convention', ar: 'اصطلاح' }, tone: 'gray' },
};

export function Risks({ model, r, x, onChange, disabled }: { model: StudyModel; r: StudyResult; x: StudyMetrics; onChange: (m: StudyModel) => void; disabled: boolean }) {
  const { t, lang } = useStudio();
  const list = useMemo(() => findings(model, r, x, lang), [model, r, x, lang]);
  const ranked = [...model.risks].sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact);
  const scoreTone = (s: number) => (s >= 15 ? 'red' : s >= 8 ? 'amber' : 'green') as 'red' | 'amber' | 'green';

  return (
    <div className="space-y-4">
      <Card title={t(bi('Analyse automatique', 'التحليل الآلي'))}>
        <p className="text-[11px] text-gray-500 mb-2">{t(bi(
          'Constats calculés à partir des valeurs de l’étude, sans intelligence artificielle ni donnée externe. Chaque constat indique sa nature : valeur calculée, hypothèse saisie ou convention de marché.',
          'ملاحظات محسوبة انطلاقاً من قيم الدراسة، دون ذكاء اصطناعي أو معطيات خارجية. تبين كل ملاحظة طبيعتها: قيمة محسوبة أو فرضية مدخلة أو اصطلاح.',
        ))}</p>
        {lang === 'ar' && <p className="mb-2 text-[11px] text-gray-500">نصوص الملاحظات معروضة بالفرنسية.</p>}
        {list.length === 0 ? <p className="text-xs text-gray-500">{t(bi('Aucun constat particulier.', 'لا توجد ملاحظات خاصة.'))}</p> : (
          <ul className="space-y-2">
            {list.map((fd) => (
              <li key={fd.id} className={`rounded-lg border p-2.5 text-xs ${fd.severity === 'critical' ? 'border-red-200 bg-red-50' : fd.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge tone={KIND[fd.kind].tone}>{t(KIND[fd.kind].label)}</Badge>
                  <span className="font-semibold" dir="auto">{fd.title}</span>
                </div>
                <p className="text-gray-700" dir="auto">{fd.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ListEditor title={t(bi('Registre des risques', 'سجل المخاطر'))} items={model.risks} disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        onChange={(v) => onChange({ ...model, risks: v })} create={() => newRisk()}
        render={(rk, u) => (<>
          <TextField label={t(bi('Risque', 'الخطر'))} value={rk.title} disabled={disabled} onChange={(v) => u({ title: v })} />
          <SelectField label={t(bi('Catégorie', 'الفئة'))} value={CATEGORIES.some((c) => c.value === rk.category) ? rk.category : 'other'} disabled={disabled}
            onChange={(v) => u({ category: v })} options={CATEGORIES.map((c) => ({ value: c.value, label: t(c.label) }))} />
          <SelectField label={t(bi('Probabilité (1–5)', 'الاحتمال (1–5)'))} value={rk.likelihood} disabled={disabled} onChange={(v) => u({ likelihood: v })} options={SCALE.map((n) => ({ value: n, label: String(n) }))} />
          <SelectField label={t(bi('Impact (1–5)', 'الأثر (1–5)'))} value={rk.impact} disabled={disabled} onChange={(v) => u({ impact: v })} options={SCALE.map((n) => ({ value: n, label: String(n) }))} />
          <TextArea className="sm:col-span-2" label={t(bi('Mesures d’atténuation', 'تدابير التخفيف'))} value={rk.mitigation} rows={2} disabled={disabled} onChange={(v) => u({ mitigation: v })} />
          <TextField label={t(bi('Responsable', 'المسؤول'))} value={rk.owner} disabled={disabled} onChange={(v) => u({ owner: v })} />
        </>)} />

      {model.risks.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartBox height={320} spec={riskMatrixSpec(t(bi('Matrice probabilité × impact', 'مصفوفة الاحتمال × الأثر')), model.risks, lang)} />
          <Card title={t(bi('Risques classés par criticité', 'المخاطر مرتبة حسب الخطورة'))}>
            <table className="min-w-full text-xs">
              <thead><tr className="text-gray-500"><th className="text-start py-1">{t(bi('Risque', 'الخطر'))}</th><th className="text-end px-2">{t(bi('Score', 'النقطة'))}</th><th className="text-start px-2">{t(bi('Atténuation', 'التخفيف'))}</th></tr></thead>
              <tbody>{ranked.map((rk) => (
                <tr key={rk.id} className="border-t border-gray-100 align-top">
                  <td className="py-1.5">{rk.title || '—'}</td>
                  <td className="px-2 text-end"><Badge tone={scoreTone(rk.likelihood * rk.impact)}>{rk.likelihood * rk.impact}</Badge></td>
                  <td className="px-2 text-gray-600">{rk.mitigation || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </div>
      )}

      <Notice>{t(bi('SWOT et PESTEL sont rédigés par vous : l’outil n’invente aucune donnée de marché. Citez vos sources dans chaque élément.', 'تحليلا SWOT وPESTEL من تحريرك: لا يختلق البرنامج أي معطيات عن السوق. اذكر مصادرك في كل عنصر.'))}</Notice>
      <Card title="SWOT">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SWOT_KEYS.map(([k, label]) => (
            <StringListEditor key={k} label={t(label)} items={model.swot[k]} disabled={disabled} onChange={(v) => onChange({ ...model, swot: { ...model.swot, [k]: v } })} />
          ))}
        </div>
      </Card>
      <Card title="PESTEL">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PESTEL_KEYS.map(([k, label]) => (
            <StringListEditor key={k} label={t(label)} items={model.pestel[k]} disabled={disabled} onChange={(v) => onChange({ ...model, pestel: { ...model.pestel, [k]: v } })} />
          ))}
        </div>
      </Card>
    </div>
  );
}
