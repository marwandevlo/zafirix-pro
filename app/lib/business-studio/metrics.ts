/**
 * Business Studio metrics: period aggregation and financial indicators derived only from an engine result.
 * Every indicator carries its formula; undefined values (zero denominators, IRR without a sign change)
 * are returned as null with a reason instead of a fabricated number.
 */

import { BALANCE_KEYS, FLOW_KEYS, type LineKey, type StudyResult } from './engine';
import { type Cents, roundHalfAwayFromZero } from './money';
import type { StudyModel } from './model';

// ─── Periods ─────────────────────────────────────────────────────────────────────────────────────

export type Granularity = 'month' | 'quarter' | 'year' | 'horizon_year';
export type Period = { key: string; label: string; months: number[]; partial: boolean };

const FLOW_SET: ReadonlySet<string> = new Set(FLOW_KEYS);
const BALANCE_SET: ReadonlySet<string> = new Set(BALANCE_KEYS);

export function isFlowKey(k: string): boolean {
  return FLOW_SET.has(k);
}
export function isBalanceKey(k: string): boolean {
  return BALANCE_SET.has(k);
}

export function periodsOf(r: StudyResult, g: Granularity): Period[] {
  const cal = r.calendar;
  if (g === 'month') return cal.labels.map((label, m) => ({ key: label, label, months: [m], partial: false }));
  if (g === 'quarter') {
    const out: Period[] = cal.quarterLabels.map((label) => ({ key: label, label, months: [], partial: false }));
    cal.quarterIndex.forEach((q, m) => out[q].months.push(m));
    for (const p of out) p.partial = p.months.length < 3;
    return out;
  }
  if (g === 'year') {
    return cal.fiscalYears.map((fy) => ({
      key: `FY${fy.index + 1}`, label: fy.label, partial: fy.partial,
      months: Array.from({ length: fy.months }, (_, i) => fy.firstMonth + i),
    }));
  }
  const years = Math.ceil(cal.months / 12);
  return Array.from({ length: years }, (_, y) => ({
    key: `A${y + 1}`, label: `Année ${y + 1}`, partial: false,
    months: Array.from({ length: Math.min(12, cal.months - y * 12) }, (_, i) => y * 12 + i),
  }));
}

/** Flows are summed; balances take the closing value of the period. */
export function aggregate(r: StudyResult, key: LineKey, g: Granularity): Cents[] {
  const s = r.monthly[key];
  const flow = isFlowKey(key);
  return periodsOf(r, g).map((p) => (flow ? p.months.reduce((t, m) => t + s[m], 0) : s[p.months[p.months.length - 1]]));
}

export function sumRange(s: readonly Cents[], from: number, to: number): Cents {
  let t = 0;
  for (let m = from; m <= to; m += 1) t += s[m] ?? 0;
  return t;
}

// ─── Indicator values ────────────────────────────────────────────────────────────────────────────

export type Unit = 'mad' | 'pct' | 'ratio' | 'months' | 'years' | 'count' | 'month_label';
export type Indicator = {
  value: number | null;
  unit: Unit;
  formula: string;
  /** Why the value is null, or a qualification of a non-null value. */
  reason?: string;
  /** Market practice threshold or method, not a legal rule. */
  convention?: string;
  /** Month index the indicator refers to, when it is a date. */
  month?: number;
};

const ind = (value: number | null, unit: Unit, formula: string, extra: Partial<Indicator> = {}): Indicator => ({ value, unit, formula, ...extra });

function div(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}
const pct = (n: number, d: number) => {
  const v = div(n, d);
  return v == null ? null : v * 100;
};

// ─── Discounting ─────────────────────────────────────────────────────────────────────────────────

export function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

export type NpvResult = { npv: Cents; terminalValue: Cents | null; discountedTerminalValue: Cents | null; reason?: string };

/** End-of-month discounting of monthly flows at an annual rate; optional Gordon terminal value on the last 12 months. */
export function npv(flows: readonly Cents[], annualRatePct: number, terminalGrowthPct: number | null = null): NpvResult {
  const rm = monthlyRate(annualRatePct);
  let v = 0;
  for (let m = 0; m < flows.length; m += 1) v += flows[m] / Math.pow(1 + rm, m + 1);
  if (terminalGrowthPct == null) return { npv: roundHalfAwayFromZero(v), terminalValue: null, discountedTerminalValue: null };
  if (terminalGrowthPct >= annualRatePct) {
    return { npv: roundHalfAwayFromZero(v), terminalValue: null, discountedTerminalValue: null, reason: 'Croissance terminale ≥ taux d’actualisation : valeur terminale non définie.' };
  }
  const last12 = flows.slice(-12).reduce((s, x) => s + x, 0) * (12 / Math.min(12, flows.length));
  const tv = (last12 * (1 + terminalGrowthPct / 100)) / ((annualRatePct - terminalGrowthPct) / 100);
  const dtv = tv / Math.pow(1 + rm, flows.length);
  return { npv: roundHalfAwayFromZero(v + dtv), terminalValue: roundHalfAwayFromZero(tv), discountedTerminalValue: roundHalfAwayFromZero(dtv) };
}

export type IrrResult = { monthlyPct: number | null; annualPct: number | null; reason?: string; multipleSignChanges: boolean };

/** IRR of monthly flows by bracketing and bisection; annualised as (1 + r)^12 − 1. */
export function irr(flows: readonly number[]): IrrResult {
  const nonZero = flows.filter((x) => x !== 0);
  let signChanges = 0;
  for (let i = 1; i < nonZero.length; i += 1) if (Math.sign(nonZero[i]) !== Math.sign(nonZero[i - 1])) signChanges += 1;
  const multipleSignChanges = signChanges > 1;
  if (nonZero.length === 0) return { monthlyPct: null, annualPct: null, reason: 'Aucun flux.', multipleSignChanges };
  if (!nonZero.some((x) => x < 0)) return { monthlyPct: null, annualPct: null, reason: 'Aucun flux négatif : le TRI n’est pas défini.', multipleSignChanges };
  if (!nonZero.some((x) => x > 0)) return { monthlyPct: null, annualPct: null, reason: 'Aucun flux positif : le TRI n’est pas défini.', multipleSignChanges };
  const f = (r: number) => {
    let v = 0;
    const base = 1 + r;
    for (let m = 0; m < flows.length; m += 1) v += flows[m] / Math.pow(base, m);
    return v;
  };
  // Candidate monthly rates ordered by distance from 0, so the bracket nearest a 0 % rate is found first.
  const grid: number[] = [0];
  for (let k = 1; k <= 400; k += 1) {
    const step = 0.0005 * Math.pow(1.03, k);
    if (step < 2) grid.push(step);
    if (step < 0.5) grid.push(-step);
  }
  grid.sort((a, b) => a - b);
  const zeroAt = grid.indexOf(0);
  const vals = grid.map(f);
  let bracket: [number, number] | null = null;
  for (let d = 0; d < grid.length && !bracket; d += 1) {
    for (const i of [zeroAt + d, zeroAt - d - 1]) {
      if (i < 0 || i + 1 >= grid.length) continue;
      const a = vals[i];
      const b = vals[i + 1];
      if (Number.isFinite(a) && Number.isFinite(b) && (a === 0 || Math.sign(a) !== Math.sign(b))) { bracket = [grid[i], grid[i + 1]]; break; }
    }
  }
  if (!bracket) {
    return { monthlyPct: null, annualPct: null, reason: 'Le TRI ne converge pas dans l’intervalle −50 % à +200 % par mois.', multipleSignChanges };
  }
  let [lo, hi] = bracket;
  let flo = f(lo);
  for (let it = 0; it < 300 && hi - lo > 1e-14; it += 1) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) { lo = mid; hi = mid; break; }
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; }
  }
  const rm = (lo + hi) / 2;
  return {
    monthlyPct: rm * 100, annualPct: (Math.pow(1 + rm, 12) - 1) * 100, multipleSignChanges,
    reason: multipleSignChanges ? 'Plusieurs changements de signe : d’autres TRI peuvent exister ; la valeur la plus proche de 0 % est retenue.' : undefined,
  };
}

export type PaybackResult = { months: number | null; reason?: string };

/** Months until cumulative flows turn non-negative (linear within the month); null if never within the horizon. */
export function payback(flows: readonly number[], annualRatePct: number | null = null): PaybackResult {
  const rm = annualRatePct == null ? 0 : monthlyRate(annualRatePct);
  let cum = 0;
  let wasNegative = false;
  for (let m = 0; m < flows.length; m += 1) {
    const x = flows[m] / Math.pow(1 + rm, m + 1);
    const before = cum;
    cum += x;
    if (cum < 0) wasNegative = true;
    if (wasNegative && before < 0 && cum >= 0) return { months: m + (x === 0 ? 1 : -before / x) };
  }
  if (!wasNegative) return { months: 0, reason: 'Flux cumulés jamais négatifs.' };
  return { months: null, reason: 'Investissement non récupéré sur l’horizon.' };
}

// ─── Fiscal-year indicators ──────────────────────────────────────────────────────────────────────

export type YearMetrics = {
  index: number; label: string; partial: boolean; firstMonth: number; lastMonth: number;
  revenue: Cents; grossMargin: Cents; ebitda: Cents; ebit: Cents; netIncome: Cents; caf: Cents; cfo: Cents; fcff: Cents; fcfe: Cents;
  incomeTax: Cents; localTaxes: Cents; employerCharges: Cents; capex: Cents; debtService: Cents;
  cashEnd: Cents; equityEnd: Cents; loansEnd: Cents; totalAssetsEnd: Cents; bfrEnd: Cents; netDebtEnd: Cents;
  variableCosts: Cents; fixedCosts: Cents; headcountEnd: number; subscribersEnd: number;
  grossMarginPct: Indicator; ebitdaMarginPct: Indicator; netMarginPct: Indicator;
  breakEvenRevenue: Indicator; safetyMarginPct: Indicator; breakEvenMonth: Indicator;
  dscr: Indicator; roe: Indicator; roa: Indicator; currentRatio: Indicator; quickRatio: Indicator;
  gearing: Indicator; netDebtToEbitda: Indicator; financialAutonomyPct: Indicator; repaymentCapacityYears: Indicator;
  bfrDaysOfRevenue: Indicator; taxBurdenPct: Indicator;
};

function yearMetrics(r: StudyResult): YearMetrics[] {
  const M = r.monthly;
  return r.calendar.fiscalYears.map((fy) => {
    const a = fy.firstMonth;
    const b = fy.lastMonth;
    const S = (k: LineKey) => sumRange(M[k], a, b);
    const E = (k: LineKey) => M[k][b];
    const revenue = S('revenue');
    const cogs = S('cogs');
    const grossMargin = revenue - cogs;
    const ebitda = S('ebitda');
    const netIncome = S('netIncome');
    const variableCosts = cogs + S('variableOpex') + S('badDebts');
    const fixedCosts = S('fixedOpex') + S('localTaxes') + S('salaries') + S('employerCharges') + S('depreciation')
      + S('financialCharges') - S('operatingGrants') - S('grantRelease');
    const cmRate = div(revenue - variableCosts, revenue);
    let breakEvenRevenue: Indicator;
    let safetyMarginPct: Indicator;
    let breakEvenMonth: Indicator;
    const beFormula = 'Charges fixes ÷ taux de marge sur coûts variables';
    if (revenue <= 0) {
      breakEvenRevenue = ind(null, 'mad', beFormula, { reason: 'Chiffre d’affaires nul.' });
      safetyMarginPct = ind(null, 'pct', '(CA − CA critique) ÷ CA', { reason: 'Chiffre d’affaires nul.' });
      breakEvenMonth = ind(null, 'month_label', 'Premier mois où la marge sur coûts variables cumulée couvre les charges fixes', { reason: 'Chiffre d’affaires nul.' });
    } else if (cmRate == null || cmRate <= 0) {
      breakEvenRevenue = ind(null, 'mad', beFormula, { reason: 'Marge sur coûts variables nulle ou négative : seuil inatteignable.' });
      safetyMarginPct = ind(null, 'pct', '(CA − CA critique) ÷ CA', { reason: 'Seuil inatteignable.' });
      breakEvenMonth = ind(null, 'month_label', 'Premier mois où la marge sur coûts variables cumulée couvre les charges fixes', { reason: 'Seuil inatteignable.' });
    } else {
      const be = Math.max(0, fixedCosts) / cmRate;
      breakEvenRevenue = ind(roundHalfAwayFromZero(be), 'mad', beFormula);
      safetyMarginPct = ind(((revenue - be) / revenue) * 100, 'pct', '(CA − CA critique) ÷ CA');
      let cum = 0;
      let month: number | null = null;
      for (let m = a; m <= b; m += 1) {
        cum += M.revenue[m] - M.cogs[m] - M.variableOpex[m] - M.badDebts[m];
        if (cum >= fixedCosts) { month = m; break; }
      }
      breakEvenMonth = month == null
        ? ind(null, 'month_label', 'Premier mois où la marge sur coûts variables cumulée couvre les charges fixes', { reason: 'Seuil non atteint sur l’exercice.' })
        : ind(month, 'month_label', 'Premier mois où la marge sur coûts variables cumulée couvre les charges fixes', { month });
    }
    const cfo = S('cfo');
    const cashInterest = S('cashOutInterest');
    const debtService = S('cashOutPrincipal') + cashInterest;
    const dscrV = debtService > 0 ? div(cfo + cashInterest, debtService) : null;
    const currentAssets = E('inventory') + E('receivables') + E('vatDeductiblePending') + E('vatCreditAsset') + E('vatRefundReceivable') + E('incomeTaxReceivable') + E('localTaxPrepaid') + E('cashAsset');
    const currentLiabilities = E('payables') + E('vatCollectedPending') + E('vatPayable') + E('incomeTaxPayable') + E('socialPayable') + E('localTaxPayable') + E('overdraft') + E('currentDebtPortion');
    const equityEnd = E('equity');
    const loansEnd = E('loans');
    const caf = S('caf');
    const incomeTax = S('incomeTax');
    const localTaxes = S('localTaxes');
    const employerCharges = S('employerCharges');
    const months = b - a + 1;
    return {
      index: fy.index, label: fy.label, partial: fy.partial, firstMonth: a, lastMonth: b,
      revenue, grossMargin, ebitda, ebit: S('ebit'), netIncome, caf, cfo, fcff: S('fcff'), fcfe: S('fcfe'),
      incomeTax, localTaxes, employerCharges, capex: S('capexCost'), debtService,
      cashEnd: E('cash'), equityEnd, loansEnd, totalAssetsEnd: E('totalAssets'), bfrEnd: E('bfr'), netDebtEnd: E('netDebt'),
      variableCosts, fixedCosts, headcountEnd: E('headcount'), subscribersEnd: E('subscribers'),
      grossMarginPct: ind(pct(grossMargin, revenue), 'pct', 'Marge brute ÷ CA', revenue === 0 ? { reason: 'CA nul.' } : {}),
      ebitdaMarginPct: ind(pct(ebitda, revenue), 'pct', 'EBE ÷ CA', revenue === 0 ? { reason: 'CA nul.' } : {}),
      netMarginPct: ind(pct(netIncome, revenue), 'pct', 'Résultat net ÷ CA', revenue === 0 ? { reason: 'CA nul.' } : {}),
      breakEvenRevenue, safetyMarginPct, breakEvenMonth,
      dscr: ind(dscrV, 'ratio', '(Flux d’exploitation + intérêts payés) ÷ (principal + intérêts payés)', {
        ...(debtService === 0 ? { reason: 'Aucun service de la dette.' } : {}), convention: 'Les banques exigent souvent un DSCR ≥ 1,2 (pratique de marché, non réglementaire).',
      }),
      roe: ind(equityEnd > 0 ? pct(netIncome, equityEnd) : null, 'pct', 'Résultat net ÷ capitaux propres de clôture', equityEnd <= 0 ? { reason: 'Capitaux propres nuls ou négatifs.' } : {}),
      roa: ind(pct(netIncome, E('totalAssets')), 'pct', 'Résultat net ÷ total actif de clôture'),
      currentRatio: ind(div(currentAssets, currentLiabilities), 'ratio', 'Actif circulant (y.c. trésorerie) ÷ passif circulant (y.c. part à moins d’un an des emprunts)', currentLiabilities === 0 ? { reason: 'Aucun passif circulant.' } : {}),
      quickRatio: ind(div(currentAssets - E('inventory'), currentLiabilities), 'ratio', '(Actif circulant − stocks) ÷ passif circulant', currentLiabilities === 0 ? { reason: 'Aucun passif circulant.' } : {}),
      gearing: ind(equityEnd > 0 ? div(loansEnd, equityEnd) : null, 'ratio', 'Dettes de financement ÷ capitaux propres', {
        ...(equityEnd <= 0 ? { reason: 'Capitaux propres nuls ou négatifs.' } : {}), convention: 'Ratio ≤ 1 souvent attendu par les prêteurs (pratique de marché).',
      }),
      netDebtToEbitda: ind(ebitda > 0 ? div(E('netDebt'), ebitda * (12 / months)) : null, 'ratio', 'Dette nette ÷ EBE annualisé', ebitda <= 0 ? { reason: 'EBE nul ou négatif.' } : {}),
      financialAutonomyPct: ind(pct(equityEnd, equityEnd + loansEnd), 'pct', 'Capitaux propres ÷ (capitaux propres + dettes de financement)', {
        convention: 'Souvent ≥ 20–30 % (pratique de marché).',
      }),
      repaymentCapacityYears: ind(caf > 0 ? div(loansEnd, caf * (12 / months)) : null, 'years', 'Dettes de financement ÷ CAF annualisée', {
        ...(caf <= 0 ? { reason: 'CAF nulle ou négative.' } : {}), convention: 'Souvent ≤ 3 à 4 ans (pratique de marché).',
      }),
      bfrDaysOfRevenue: ind(revenue > 0 ? (E('bfr') / revenue) * months * 30 : null, 'count', 'BFR ÷ CA × jours de l’exercice (30 j/mois)', revenue <= 0 ? { reason: 'CA nul.' } : {}),
      taxBurdenPct: ind(pct(incomeTax + localTaxes + employerCharges, revenue), 'pct', '(IS/IR + impôts locaux + charges patronales) ÷ CA', revenue === 0 ? { reason: 'CA nul.' } : {}),
    };
  });
}

// ─── SaaS indicators ─────────────────────────────────────────────────────────────────────────────

export type SaasMetrics = {
  mrr: Cents[]; subscribers: number[]; newCustomers: number[]; churned: number[];
  mrrEnd: Indicator; arrEnd: Indicator; churnMonthlyPct: Indicator; arpu: Indicator; cac: Indicator; ltv: Indicator; ltvToCac: Indicator;
};

function saasMetrics(r: StudyResult): SaasMetrics | null {
  const subs = r.products.filter((p) => p.kind === 'subscription');
  if (subs.length === 0) return null;
  const N = r.calendar.months;
  const mrr = new Array<number>(N).fill(0);
  const subscribers = new Array<number>(N).fill(0);
  const newCustomers = new Array<number>(N).fill(0);
  const churned = new Array<number>(N).fill(0);
  let cacTotal = 0;
  let grossMargin = 0;
  let revenue = 0;
  for (const p of subs) {
    for (let m = 0; m < N; m += 1) {
      mrr[m] += p.revenue[m];
      subscribers[m] += p.volume[m];
      newCustomers[m] += p.newCustomers[m];
      churned[m] += Math.max(0, (m > 0 ? p.volume[m - 1] : 0) + p.newCustomers[m] - p.volume[m]);
      cacTotal += p.cac[m];
      grossMargin += p.revenue[m] - p.cogs[m];
      revenue += p.revenue[m];
    }
  }
  const last = N - 1;
  const exposure = subscribers.slice(0, last).reduce((s, v) => s + v, 0);
  const churnRate = exposure > 0 ? churned.slice(1).reduce((s, v) => s + v, 0) / exposure : null;
  const totalNew = newCustomers.reduce((s, v) => s + v, 0);
  const subscriberMonths = subscribers.reduce((s, v) => s + v, 0);
  const arpu = subscriberMonths > 0 ? revenue / subscriberMonths : null;
  const gmRate = revenue > 0 ? grossMargin / revenue : null;
  const cac = totalNew > 0 ? cacTotal / totalNew : null;
  const ltv = arpu != null && gmRate != null && churnRate != null && churnRate > 0 ? (arpu * gmRate) / churnRate : null;
  return {
    mrr, subscribers, newCustomers, churned,
    mrrEnd: ind(mrr[last], 'mad', 'Revenus d’abonnement du dernier mois'),
    arrEnd: ind(mrr[last] * 12, 'mad', 'MRR × 12'),
    churnMonthlyPct: ind(churnRate == null ? null : churnRate * 100, 'pct', 'Abonnés perdus ÷ abonnés en début de mois (moyenne pondérée)', churnRate == null ? { reason: 'Aucun abonné.' } : {}),
    arpu: ind(arpu == null ? null : roundHalfAwayFromZero(arpu), 'mad', 'Revenus d’abonnement ÷ abonnés-mois', arpu == null ? { reason: 'Aucun abonné.' } : {}),
    cac: ind(cac == null ? null : roundHalfAwayFromZero(cac), 'mad', 'Coûts d’acquisition ÷ nouveaux clients', cac == null ? { reason: 'Aucun nouveau client.' } : {}),
    ltv: ind(ltv == null ? null : roundHalfAwayFromZero(ltv), 'mad', 'ARPU × taux de marge brute ÷ churn mensuel', ltv == null ? { reason: 'Churn nul ou données insuffisantes.' } : {}),
    ltvToCac: ind(ltv != null && cac != null && cac > 0 ? ltv / cac : null, 'ratio', 'LTV ÷ CAC'),
  };
}

// ─── Study-level indicators ──────────────────────────────────────────────────────────────────────

export type StudyMetrics = {
  years: YearMetrics[];
  saas: SaasMetrics | null;
  totals: { revenue: Cents; ebitda: Cents; netIncome: Cents; caf: Cents; capex: Cents; equityRaised: Cents; loansRaised: Cents; grants: Cents; dividends: Cents; taxes: Cents };
  npv: Indicator; npvTerminal: Indicator; irrProject: Indicator; irrEquity: Indicator; irrEquityWithBookValue: Indicator;
  payback: Indicator; discountedPayback: Indicator; roi: Indicator; minDscr: Indicator; peakFundingNeed: Indicator;
  cashEnd: Indicator; minCash: Indicator; profitabilityIndex: Indicator;
};

/** First complete fiscal year, or the first one when none is complete (a one-month opening stub is not representative). */
export function firstFullYear(x: StudyMetrics): YearMetrics | undefined {
  return x.years.find((y) => !y.partial) ?? x.years[0];
}

export function computeMetrics(model: StudyModel, r: StudyResult): StudyMetrics {
  const M = r.monthly;
  const N = r.calendar.months;
  const total = (k: LineKey) => sumRange(M[k], 0, N - 1);
  const years = yearMetrics(r);
  const rate = model.general.discountRatePct;
  const g = model.general.terminalGrowthPct;
  const fcff = M.fcff;
  const n0 = npv(fcff, rate, null);
  const nT = g == null ? null : npv(fcff, rate, g);
  const ip = irr(fcff);
  const equityFlows = M.cashInEquity.map((x, m) => -x + M.cashOutDividends[m]);
  const ie = irr(equityFlows);
  const equityWithBook = equityFlows.slice();
  equityWithBook[N - 1] += Math.max(0, M.equity[N - 1]);
  const ieb = irr(equityWithBook);
  const pb = payback(fcff);
  const dpb = payback(fcff, rate);
  const capex = total('capexCost');
  const netIncome = total('netIncome');
  const dscrValues = years.map((y) => y.dscr.value).filter((v): v is number => v != null);
  const minDscr = dscrValues.length ? Math.min(...dscrValues) : null;
  let minBefore = Infinity;
  let minBeforeAt = -1;
  for (let m = 0; m < N; m += 1) if (M.cashBeforeFinancing[m] < minBefore) { minBefore = M.cashBeforeFinancing[m]; minBeforeAt = m; }
  let minCash = Infinity;
  let minCashAt = -1;
  for (let m = 0; m < N; m += 1) if (M.cash[m] < minCash) { minCash = M.cash[m]; minCashAt = m; }
  const pvInflows = npv(fcff.map((x) => Math.max(0, x)), rate).npv;
  const pvOutflows = -npv(fcff.map((x) => Math.min(0, x)), rate).npv;
  const irrInd = (res: ReturnType<typeof irr>, formula: string): Indicator => ind(res.annualPct, 'pct', formula, res.reason ? { reason: res.reason } : {});
  return {
    years,
    saas: saasMetrics(r),
    totals: {
      revenue: total('revenue'), ebitda: total('ebitda'), netIncome, caf: total('caf'), capex,
      equityRaised: total('cashInEquity'), loansRaised: total('cashInLoans'), grants: total('cashInGrants'),
      dividends: total('dividendsGross'), taxes: total('incomeTax') + total('localTaxes'),
    },
    npv: ind(n0.npv, 'mad', `Σ FCFF actualisés au taux annuel de ${rate} % (fin de mois), sans valeur terminale ; FCFF = flux d’exploitation (IS pris en charge de l’exercice, sans décalage de paiement) + intérêts payés − charges financières × taux d’IS légal + flux d’investissement`),
    npvTerminal: nT == null
      ? ind(null, 'mad', 'VAN + valeur terminale de Gordon', { reason: 'Croissance terminale non saisie.' })
      : ind(nT.reason ? null : nT.npv, 'mad', `VAN + valeur terminale (FCFF des 12 derniers mois × (1 + ${g} %) ÷ (${rate} % − ${g} %))`, nT.reason ? { reason: nT.reason } : {}),
    irrProject: irrInd(ip, 'Taux annualisé annulant la VAN des FCFF mensuels'),
    irrEquity: irrInd(ie, 'TRI des flux actionnaires : − apports + dividendes nets'),
    irrEquityWithBookValue: { ...irrInd(ieb, 'TRI actionnaires avec capitaux propres comptables de fin d’horizon en valeur de sortie'), convention: 'Valeur de sortie = valeur comptable (hypothèse simplificatrice).' },
    payback: ind(pb.months, 'months', 'Mois jusqu’à ce que le cumul des FCFF redevienne positif', pb.reason ? { reason: pb.reason } : {}),
    discountedPayback: ind(dpb.months, 'months', `Idem avec FCFF actualisés à ${rate} %`, dpb.reason ? { reason: dpb.reason } : {}),
    roi: ind(capex > 0 ? (netIncome / capex) * 100 : null, 'pct', 'Résultat net cumulé ÷ investissements cumulés', capex <= 0 ? { reason: 'Aucun investissement.' } : {}),
    minDscr: ind(minDscr, 'ratio', 'Plus faible DSCR annuel', minDscr == null ? { reason: 'Aucun service de la dette.' } : {}),
    peakFundingNeed: ind(Math.max(0, -minBefore), 'mad', 'Plus forte trésorerie négative cumulée avant financement (apports, emprunts, subventions)', minBefore < 0 ? { month: minBeforeAt } : { reason: 'Aucun besoin : l’exploitation et les investissements sont autofinancés.' }),
    cashEnd: ind(M.cash[N - 1], 'mad', 'Trésorerie nette de fin d’horizon (disponibilités − découvert)'),
    minCash: ind(minCash, 'mad', 'Trésorerie nette la plus basse', { month: minCashAt }),
    profitabilityIndex: ind(pvOutflows > 0 ? pvInflows / pvOutflows : null, 'ratio', 'VA des FCFF positifs ÷ VA des FCFF négatifs', pvOutflows <= 0 ? { reason: 'Aucun flux négatif.' } : {}),
  };
}
