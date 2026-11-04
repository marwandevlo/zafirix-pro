'use client';

import { useCallback } from 'react';
import type { SensitivityMetric } from '@/app/lib/business-studio/analysis';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import { monthLabel, type Bi } from '@/app/lib/business-studio/i18n';
import type { Indicator } from '@/app/lib/business-studio/metrics';
import type { Levers } from '@/app/lib/business-studio/model';
import { useFormat, useStudio } from './ui';

export type LeverUnit = 'pct' | 'pts' | 'days' | 'months';
export type LeverDef = { id: Exclude<keyof Levers, 'isRateOverridePct'>; label: Bi; unit: LeverUnit; min: number; max: number; step: number };

/** Slider ranges are a UI choice; the server validator accepts wider bounds. */
export const LEVER_DEFS: readonly LeverDef[] = [
  { id: 'priceFactorPct', label: { fr: 'Prix de vente', ar: 'ثمن البيع' }, unit: 'pct', min: -50, max: 100, step: 1 },
  { id: 'volumeFactorPct', label: { fr: 'Volumes', ar: 'الكميات' }, unit: 'pct', min: -80, max: 200, step: 1 },
  { id: 'revenueGrowthDeltaPts', label: { fr: 'Croissance annuelle des volumes', ar: 'النمو السنوي للكميات' }, unit: 'pts', min: -50, max: 50, step: 1 },
  { id: 'unitCostFactorPct', label: { fr: 'Coût unitaire', ar: 'التكلفة الوحدوية' }, unit: 'pct', min: -50, max: 100, step: 1 },
  { id: 'opexFactorPct', label: { fr: 'Charges externes', ar: 'التكاليف الخارجية' }, unit: 'pct', min: -50, max: 100, step: 1 },
  { id: 'headcountFactorPct', label: { fr: 'Effectif', ar: 'عدد المستخدمين' }, unit: 'pct', min: -50, max: 100, step: 1 },
  { id: 'wageFactorPct', label: { fr: 'Salaires', ar: 'الأجور' }, unit: 'pct', min: -30, max: 100, step: 1 },
  { id: 'inflationDeltaPts', label: { fr: 'Inflation', ar: 'التضخم' }, unit: 'pts', min: -5, max: 15, step: 0.5 },
  { id: 'dsoDeltaDays', label: { fr: 'Délai clients', ar: 'أجل أداء الزبناء' }, unit: 'days', min: -60, max: 180, step: 5 },
  { id: 'dpoDeltaDays', label: { fr: 'Délai fournisseurs', ar: 'أجل أداء الموردين' }, unit: 'days', min: -60, max: 180, step: 5 },
  { id: 'inventoryDeltaDays', label: { fr: 'Durée de stockage', ar: 'مدة التخزين' }, unit: 'days', min: -60, max: 180, step: 5 },
  { id: 'capexFactorPct', label: { fr: 'Investissements', ar: 'الاستثمارات' }, unit: 'pct', min: -50, max: 100, step: 1 },
  { id: 'loanAmountFactorPct', label: { fr: 'Montant des emprunts', ar: 'مبلغ القروض' }, unit: 'pct', min: -100, max: 100, step: 5 },
  { id: 'interestDeltaPts', label: { fr: 'Taux d’intérêt', ar: 'سعر الفائدة' }, unit: 'pts', min: -5, max: 10, step: 0.25 },
  { id: 'loanTermDeltaMonths', label: { fr: 'Durée des emprunts', ar: 'مدة القروض' }, unit: 'months', min: -60, max: 120, step: 6 },
  { id: 'exchangeRateFactorPct', label: { fr: 'Taux de change', ar: 'سعر الصرف' }, unit: 'pct', min: -30, max: 50, step: 1 },
  { id: 'capacityFactorPct', label: { fr: 'Capacité', ar: 'الطاقة الإنتاجية' }, unit: 'pct', min: -50, max: 100, step: 1 },
  { id: 'utilizationDeltaPts', label: { fr: 'Taux d’utilisation', ar: 'نسبة الاستغلال' }, unit: 'pts', min: -50, max: 50, step: 1 },
  { id: 'launchDelayMonths', label: { fr: 'Retard de lancement', ar: 'تأخر الانطلاق' }, unit: 'months', min: 0, max: 24, step: 1 },
  { id: 'expansionDelayMonths', label: { fr: 'Retard des extensions', ar: 'تأخر التوسعات' }, unit: 'months', min: 0, max: 24, step: 1 },
];

export const LEVER_LABEL = Object.fromEntries(LEVER_DEFS.map((l) => [l.id, l.label])) as Record<LeverDef['id'], Bi>;

export const UNIT_LABEL: Record<LeverUnit, Bi> = {
  pct: { fr: '%', ar: '%' }, pts: { fr: 'pts', ar: 'نقطة' }, days: { fr: 'j', ar: 'يوم' }, months: { fr: 'mois', ar: 'شهر' },
};

export const METRIC_LABEL: Record<SensitivityMetric, Bi> = {
  npv: { fr: 'VAN', ar: 'القيمة الحالية الصافية' },
  netIncome: { fr: 'Résultat net cumulé', ar: 'النتيجة الصافية المتراكمة' },
  cashEnd: { fr: 'Trésorerie finale', ar: 'الخزينة النهائية' },
  minCash: { fr: 'Trésorerie minimale', ar: 'أدنى خزينة' },
  irrProject: { fr: 'TRI projet', ar: 'معدل العائد الداخلي للمشروع' },
  peakFundingNeed: { fr: 'Besoin de financement maximal', ar: 'أقصى حاجة للتمويل' },
};

export const STRESS_LABEL: Record<string, Bi> = {
  'revenue-30': { fr: 'Chute des volumes de 30 %', ar: 'انخفاض الكميات بنسبة 30%' },
  'price-15': { fr: 'Baisse des prix de 15 %', ar: 'انخفاض الأثمان بنسبة 15%' },
  'costs+20': { fr: 'Hausse des coûts unitaires et des charges de 20 %', ar: 'ارتفاع التكاليف الوحدوية والتكاليف بنسبة 20%' },
  'dso+60': { fr: 'Allongement du délai clients de 60 jours', ar: 'تمديد أجل أداء الزبناء بـ 60 يوماً' },
  'rates+3': { fr: 'Hausse des taux d’intérêt de 3 points', ar: 'ارتفاع أسعار الفائدة بـ 3 نقط' },
  delay6: { fr: 'Retard de lancement de 6 mois', ar: 'تأخر الانطلاق بستة أشهر' },
  combined: { fr: 'Choc combiné (volumes −20 %, coûts +10 %, clients +30 jours)', ar: 'صدمة مركبة: الكميات −20% والتكاليف +10% والزبناء +30 يوماً' },
};

/** Formats an engine indicator in the current language; null values show "n.d." with the reason in the tooltip. */
export function useIndicator(r: StudyResult) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const show = useCallback((i: Indicator): string => {
    if (i.value == null) return t('notAvailable');
    switch (i.unit) {
      case 'mad': return `${f.mad(i.value)} ${t('mad')}`;
      case 'pct': return f.pct(i.value);
      case 'ratio': return f.num(i.value, 2);
      case 'months': return `${f.num(i.value)} ${lang === 'ar' ? 'شهر' : 'mois'}`;
      case 'years': return `${f.num(i.value, 1)} ${t('years')}`;
      case 'month_label': return monthLabel(r.calendar.labels[i.value] ?? '', lang);
      default: return f.num(i.value);
    }
  }, [f, lang, r, t]);
  const tip = useCallback((i: Indicator) => [i.formula, i.reason, i.convention].filter(Boolean).join(' — '), []);
  return { show, tip };
}
