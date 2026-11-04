/**
 * Side-by-side comparison of two independent studies. Each study is computed with its own assumptions, calendar
 * and active scenario; fiscal years are aligned by rank (year 1, 2, …), not by calendar year.
 */
import type { StudyResult } from './engine';
import type { Bi } from './i18n';
import type { Indicator, StudyMetrics, Unit } from './metrics';
import type { StudyModel } from './model';

export type ComparedStudy = { name: string; model: StudyModel; r: StudyResult; x: StudyMetrics };

/** `better` says which direction is favourable, so the screen can mark the stronger value; null when neutral. */
export type CompareRow = { key: string; label: Bi; unit: Unit; a: number | null; b: number | null; diff: number | null; better: 'higher' | 'lower' | null };

export type CompareYears = {
  labels: string[];
  a: { revenue: Array<number | null>; netIncome: Array<number | null>; cashEnd: Array<number | null>; dscr: Array<number | null> };
  b: { revenue: Array<number | null>; netIncome: Array<number | null>; cashEnd: Array<number | null>; dscr: Array<number | null> };
};

export type Comparison = { rows: CompareRow[]; years: CompareYears; notes: Bi[] };

const B = (fr: string, ar: string): Bi => ({ fr, ar });

export function compareStudies(a: ComparedStudy, b: ComparedStudy): Comparison {
  const rows: CompareRow[] = [];
  const add = (key: string, label: Bi, unit: Unit, va: number | null, vb: number | null, better: CompareRow['better']) =>
    rows.push({ key, label, unit, a: va, b: vb, diff: va == null || vb == null ? null : vb - va, better });
  const fromInd = (key: string, label: Bi, pick: (x: StudyMetrics) => Indicator, better: CompareRow['better']) => {
    const ia = pick(a.x);
    add(key, label, ia.unit, ia.value, pick(b.x).value, better);
  };

  add('years', B('Horizon (années)', 'المدة (سنوات)'), 'count', a.model.horizon.years, b.model.horizon.years, null);
  add('revenue', B('Chiffre d’affaires cumulé', 'رقم المعاملات المتراكم'), 'mad', a.x.totals.revenue, b.x.totals.revenue, 'higher');
  add('ebitda', B('EBE cumulé', 'الفائض الإجمالي للاستغلال المتراكم'), 'mad', a.x.totals.ebitda, b.x.totals.ebitda, 'higher');
  add('netIncome', B('Résultat net cumulé', 'النتيجة الصافية المتراكمة'), 'mad', a.x.totals.netIncome, b.x.totals.netIncome, 'higher');
  add('caf', B('CAF cumulée', 'القدرة على التمويل الذاتي المتراكمة'), 'mad', a.x.totals.caf, b.x.totals.caf, 'higher');
  add('capex', B('Investissements HT', 'الاستثمارات دون رسوم'), 'mad', a.x.totals.capex, b.x.totals.capex, null);
  add('equity', B('Apports en capital', 'المساهمات في الرأسمال'), 'mad', a.x.totals.equityRaised, b.x.totals.equityRaised, null);
  add('loans', B('Emprunts', 'القروض'), 'mad', a.x.totals.loansRaised, b.x.totals.loansRaised, null);
  add('taxes', B('Impôt sur le résultat et impôts locaux (charges)', 'الضريبة على النتيجة والضرائب المحلية (تكاليف)'), 'mad', a.x.totals.taxes, b.x.totals.taxes, null);
  fromInd('npv', B('VAN (taux de chaque étude)', 'القيمة الحالية الصافية (معدل كل دراسة)'), (x) => x.npv, 'higher');
  fromInd('irr', B('TRI projet', 'معدل العائد الداخلي للمشروع'), (x) => x.irrProject, 'higher');
  fromInd('irrEquity', B('TRI actionnaires', 'معدل العائد الداخلي للمساهمين'), (x) => x.irrEquity, 'higher');
  fromInd('irrEquityBook', B('TRI actionnaires (sortie comptable)', 'معدل العائد للمساهمين (خروج محاسبي)'), (x) => x.irrEquityWithBookValue, 'higher');
  fromInd('payback', B('Délai de récupération', 'مدة الاسترداد'), (x) => x.payback, 'lower');
  fromInd('roi', B('ROI', 'العائد على الاستثمار'), (x) => x.roi, 'higher');
  fromInd('minDscr', B('DSCR minimal', 'أدنى نسبة تغطية خدمة الدين'), (x) => x.minDscr, 'higher');
  fromInd('minCash', B('Trésorerie minimale', 'أدنى خزينة'), (x) => x.minCash, 'higher');
  fromInd('peak', B('Besoin de financement maximal', 'أقصى حاجة للتمويل'), (x) => x.peakFundingNeed, 'lower');
  fromInd('cashEnd', B('Trésorerie fin d’horizon', 'الخزينة في نهاية الأفق'), (x) => x.cashEnd, 'higher');

  const n = Math.max(a.x.years.length, b.x.years.length);
  const col = (s: ComparedStudy, f: (y: StudyMetrics['years'][number]) => number | null) =>
    Array.from({ length: n }, (_, i) => (s.x.years[i] ? f(s.x.years[i]) : null));
  const side = (s: ComparedStudy) => ({
    revenue: col(s, (y) => y.revenue), netIncome: col(s, (y) => y.netIncome), cashEnd: col(s, (y) => y.cashEnd), dscr: col(s, (y) => y.dscr.value),
  });
  const years: CompareYears = { labels: Array.from({ length: n }, (_, i) => String(i + 1)), a: side(a), b: side(b) };

  const notes: Bi[] = [];
  if (a.model.horizon.years !== b.model.horizon.years) {
    notes.push(B(
      `Horizons différents (${a.model.horizon.years} et ${b.model.horizon.years} ans) : les cumuls couvrent des durées différentes ; comparez aussi les valeurs par exercice.`,
      `مدد مختلفة (${a.model.horizon.years} و${b.model.horizon.years} سنوات): المجاميع تغطي مدداً مختلفة؛ قارن أيضاً القيم حسب السنة.`,
    ));
  }
  if (a.model.horizon.startMonth !== b.model.horizon.startMonth) {
    notes.push(B(
      `Dates de démarrage différentes (${a.model.horizon.startMonth} et ${b.model.horizon.startMonth}) : les exercices sont alignés par rang, pas par année civile.`,
      `تواريخ انطلاق مختلفة (${a.model.horizon.startMonth} و${b.model.horizon.startMonth}): السنوات مرتبة حسب الرتبة وليس حسب السنة المدنية.`,
    ));
  }
  if (a.x.years[0]?.partial || b.x.years[0]?.partial) {
    notes.push(B('Au moins une étude commence par un exercice partiel : l’exercice 1 n’a pas la même durée dans les deux études.', 'دراسة واحدة على الأقل تبدأ بسنة جزئية: السنة الأولى ليست بنفس المدة في الدراستين.'));
  }
  if (a.model.general.discountRatePct !== b.model.general.discountRatePct) {
    notes.push(B(
      `Taux d’actualisation différents (${a.model.general.discountRatePct} % et ${b.model.general.discountRatePct} %) : les VAN ne sont pas directement comparables.`,
      `معدلات تحيين مختلفة (${a.model.general.discountRatePct}% و${b.model.general.discountRatePct}%): القيم الحالية الصافية غير قابلة للمقارنة مباشرة.`,
    ));
  }
  if (!a.r.checks.ok || !b.r.checks.ok) {
    notes.push(B('Une des études ne passe pas les contrôles de cohérence : ses chiffres doivent être corrigés avant toute comparaison.', 'إحدى الدراستين لا تجتاز مراقبة الاتساق: يجب تصحيح أرقامها قبل أي مقارنة.'));
  }
  return { rows, years, notes };
}
