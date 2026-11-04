/**
 * Forecast vs actual: aggregates real journal lines (read-only) by month and CGNC account class.
 * Nothing here writes to accounting data; the API route only selects rows the caller may read.
 */

import type { StudyResult } from './engine';
import { toCents, type Cents } from './money';

export type ActualLine = { date: string; account: string; debit: number; credit: number; status: string };

export const ACTUAL_STATUSES_DEFAULT: readonly string[] = ['validated'];
export const ACTUAL_STATUSES_WITH_UNVALIDATED: readonly string[] = ['validated', 'reviewed', 'needs_review', 'draft'];

export type ActualCategory = 'revenue' | 'cogs' | 'externalCharges' | 'localTaxes' | 'staffCosts' | 'depreciation' | 'financialCharges' | 'financialIncome' | 'nonCurrentCharges' | 'nonCurrentIncome' | 'incomeTax' | 'otherOperatingIncome';

/** CGNC classes 6 and 7 mapping (Plan comptable marocain). */
export function categorize(account: string): ActualCategory | null {
  const a = account.replace(/\D/g, '');
  if (a.startsWith('711') || a.startsWith('712')) return 'revenue';
  if (a.startsWith('71')) return 'otherOperatingIncome';
  if (a.startsWith('611') || a.startsWith('612')) return 'cogs';
  if (a.startsWith('613') || a.startsWith('614') || a.startsWith('618')) return 'externalCharges';
  if (a.startsWith('616')) return 'localTaxes';
  if (a.startsWith('617')) return 'staffCosts';
  if (a.startsWith('619')) return 'depreciation';
  if (a.startsWith('63')) return 'financialCharges';
  if (a.startsWith('73')) return 'financialIncome';
  if (a.startsWith('65')) return 'nonCurrentCharges';
  if (a.startsWith('75')) return 'nonCurrentIncome';
  if (a.startsWith('67')) return 'incomeTax';
  return null;
}

export type ActualsByMonth = {
  months: string[];
  series: Record<ActualCategory | 'netIncome' | 'cashMovement', Cents[]>;
  lineCount: number;
  ignoredLines: number;
};

const CATS: ActualCategory[] = ['revenue', 'cogs', 'externalCharges', 'localTaxes', 'staffCosts', 'depreciation', 'financialCharges', 'financialIncome', 'nonCurrentCharges', 'nonCurrentIncome', 'incomeTax', 'otherOperatingIncome'];
const INCOME: ReadonlySet<ActualCategory> = new Set(['revenue', 'financialIncome', 'nonCurrentIncome', 'otherOperatingIncome']);

/** Aggregates lines onto the study calendar (YYYY-MM labels). Lines outside the horizon are ignored. */
export function aggregateActuals(lines: readonly ActualLine[], monthLabels: readonly string[], statuses: readonly string[] = ACTUAL_STATUSES_DEFAULT): ActualsByMonth {
  const index = new Map(monthLabels.map((l, i) => [l, i]));
  const N = monthLabels.length;
  const series = Object.fromEntries([...CATS, 'netIncome', 'cashMovement'].map((k) => [k, new Array<number>(N).fill(0)])) as ActualsByMonth['series'];
  let lineCount = 0;
  let ignored = 0;
  const allowed = new Set(statuses);
  for (const l of lines) {
    const m = index.get(String(l.date).slice(0, 7));
    if (m == null || !allowed.has(l.status)) { ignored += 1; continue; }
    const debit = toCents(Number(l.debit) || 0);
    const credit = toCents(Number(l.credit) || 0);
    const acct = String(l.account ?? '').replace(/\D/g, '');
    if (acct.startsWith('514') || acct.startsWith('516') || acct.startsWith('554')) series.cashMovement[m] += debit - credit;
    const cat = categorize(acct);
    if (!cat) { lineCount += 1; continue; }
    const amount = INCOME.has(cat) ? credit - debit : debit - credit;
    series[cat][m] += amount;
    series.netIncome[m] += INCOME.has(cat) ? amount : -amount;
    lineCount += 1;
  }
  return { months: [...monthLabels], series, lineCount, ignoredLines: ignored };
}

/** Re-indexes actuals onto another calendar (e.g. an edited, unsaved horizon); months absent from the source are zero. */
export function alignActuals(a: ActualsByMonth, monthLabels: readonly string[]): ActualsByMonth {
  const pos = new Map(a.months.map((l, i) => [l, i]));
  const series = Object.fromEntries(Object.entries(a.series).map(([k, s]) => [k, monthLabels.map((l) => {
    const i = pos.get(l);
    return i == null ? 0 : s[i];
  })])) as ActualsByMonth['series'];
  return { ...a, months: [...monthLabels], series };
}

export type VarianceRow = { key: string; label: string; forecast: Cents; actual: Cents; variance: Cents; variancePct: number | null };

/** Forecast vs actual for a month range (inclusive), on comparable lines only. */
export function variance(result: StudyResult, actuals: ActualsByMonth, from: number, to: number): VarianceRow[] {
  const sum = (s: readonly number[]) => { let t = 0; for (let m = from; m <= to; m += 1) t += s[m] ?? 0; return t; };
  const M = result.monthly;
  const pairs: Array<[string, string, Cents, Cents]> = [
    ['revenue', 'Chiffre d’affaires', sum(M.revenue), sum(actuals.series.revenue)],
    ['cogs', 'Achats consommés', sum(M.cogs), sum(actuals.series.cogs)],
    ['externalCharges', 'Charges externes', sum(M.externalCharges), sum(actuals.series.externalCharges)],
    ['localTaxes', 'Impôts et taxes', sum(M.localTaxes), sum(actuals.series.localTaxes)],
    ['staffCosts', 'Charges de personnel', sum(M.salaries) + sum(M.employerCharges), sum(actuals.series.staffCosts)],
    ['depreciation', 'Dotations', sum(M.depreciation), sum(actuals.series.depreciation)],
    ['financialCharges', 'Charges financières', sum(M.financialCharges), sum(actuals.series.financialCharges)],
    ['incomeTax', 'Impôt sur les résultats', sum(M.incomeTax), sum(actuals.series.incomeTax)],
    ['netIncome', 'Résultat net', sum(M.netIncome), sum(actuals.series.netIncome)],
    ['cashMovement', 'Variation de trésorerie (comptes 514, 516, 554)', sum(M.netCashFlow), sum(actuals.series.cashMovement)],
  ];
  return pairs.map(([key, label, forecast, actual]) => ({
    key, label, forecast, actual, variance: actual - forecast, variancePct: forecast !== 0 ? ((actual - forecast) / Math.abs(forecast)) * 100 : null,
  }));
}
