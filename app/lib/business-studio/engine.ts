/**
 * Business Studio financial engine: one deterministic monthly projection from a study model.
 *
 * Every amount is an integer number of centimes. Each economic event is booked once on both sides
 * (statement and balance sheet), so the balance-sheet identity holds exactly every month and the cash
 * flow statement, the plan de financement and the treasury plan reconcile to the centime.
 *
 * VAT never reaches the income statement except as a cost when it is not deductible. Accounting
 * profit and cash are separate series; loan principal, capital expenditure and VAT are cash and
 * balance-sheet movements only.
 */

import { allocate, applyRate, type Cents, mulCents, roundHalfAwayFromZero, toCents } from './money';
import type { Investment, Levers, Loan, StudyModel } from './model';
import { NEUTRAL_LEVERS } from './model';
import {
  isLegalVatRate, irAnnual, legalDecliningCoefficient, minimumContributionRatePct, monthlyPayroll,
  MINIMUM_CONTRIBUTION_FLOOR_IR, MINIMUM_CONTRIBUTION_FLOOR_IS, resolveIsRate, type RuleStatus, TAX_RULES_VERSION,
} from './tax-rules';

export const ENGINE_VERSION = 'studio-engine-1.0.0';

// ─── Calendar ────────────────────────────────────────────────────────────────────────────────────

export type FiscalYear = {
  index: number;
  /** Calendar year in which the fiscal year opens (selects the tax rules). */
  openYear: number;
  label: string;
  firstMonth: number;
  lastMonth: number;
  months: number;
  /** Offset of the fiscal year's first month from the horizon start (negative when it opened earlier). */
  startOffset: number;
  partial: boolean;
};

export type Calendar = {
  months: number;
  labels: string[];
  calYear: number[];
  calMonth: number[];
  fiscalIndex: number[];
  fiscalYears: FiscalYear[];
  quarterLabels: string[];
  quarterIndex: number[];
};

export function buildCalendar(startMonth: string, years: number, fiscalYearStartMonth: number): Calendar {
  const [y0, m0] = startMonth.split('-').map(Number);
  const months = years * 12;
  const labels: string[] = [];
  const calYear: number[] = [];
  const calMonth: number[] = [];
  const fiscalIndex: number[] = [];
  const quarterIndex: number[] = [];
  const quarterLabels: string[] = [];
  const fiscalYears: FiscalYear[] = [];
  const fs = fiscalYearStartMonth;
  const fyOpen = (cy: number, cm: number) => (cm >= fs ? cy : cy - 1);
  const firstOpen = fyOpen(y0, m0);
  let lastQuarterKey = '';
  for (let m = 0; m < months; m += 1) {
    const z = m0 - 1 + m;
    const cy = y0 + Math.floor(z / 12);
    const cm = (z % 12) + 1;
    labels.push(`${cy}-${String(cm).padStart(2, '0')}`);
    calYear.push(cy);
    calMonth.push(cm);
    const open = fyOpen(cy, cm);
    const fi = open - firstOpen;
    fiscalIndex.push(fi);
    if (!fiscalYears[fi]) {
      const monthsSinceOpen = (cm - fs + 12) % 12;
      fiscalYears[fi] = {
        index: fi, openYear: open, label: fs === 1 ? String(open) : `${open}/${String(open + 1).slice(2)}`,
        firstMonth: m, lastMonth: m, months: 0, startOffset: m - monthsSinceOpen, partial: false,
      };
    }
    const fy = fiscalYears[fi];
    fy.lastMonth = m;
    fy.months += 1;
    const qKey = `${cy}-T${Math.floor((cm - 1) / 3) + 1}`;
    if (qKey !== lastQuarterKey) {
      quarterLabels.push(qKey);
      lastQuarterKey = qKey;
    }
    quarterIndex.push(quarterLabels.length - 1);
  }
  for (const fy of fiscalYears) fy.partial = fy.months < 12;
  return { months, labels, calYear, calMonth, fiscalIndex, fiscalYears, quarterLabels, quarterIndex };
}

// ─── Result types ────────────────────────────────────────────────────────────────────────────────

export type Series = Cents[];

export const FLOW_KEYS = [
  'revenueGross', 'discounts', 'returns', 'revenue', 'operatingGrants', 'purchases', 'inventoryVariation', 'cogs',
  'externalCharges', 'leaseCharges', 'cacCharges', 'localTaxes', 'salaries', 'employerCharges',
  'ebitda', 'depreciation', 'ebit', 'interest', 'loanFees', 'overdraftInterest', 'financialCharges', 'financialResult',
  'grantRelease', 'badDebts', 'nonCurrentResult', 'ebt', 'incomeTax', 'netIncome',
  'variableOpex', 'fixedOpex', 'capitalizedInterest',
  'cashInSales', 'cashInEquity', 'cashInLoans', 'cashInGrants', 'cashInInvestmentGrants', 'cashOutSuppliers', 'cashOutOpex',
  'cashOutNetSalaries', 'cashOutSocial', 'cashOutIrSalarial', 'cashOutVat', 'cashOutIncomeTax', 'cashOutLocalTaxes',
  'cashOutCapex', 'cashOutPrincipal', 'cashOutInterest', 'cashOutDividends', 'cashOutDividendWithholding', 'netCashFlow',
  'vatCollectedDue', 'vatDeductible', 'vatInvoicedSales', 'irSalarial', 'employeeSocial', 'netSalaries',
  'capexCost', 'capexVat', 'dividendsGross',
  'cfo', 'cfi', 'cff', 'fcff', 'fcfe', 'caf', 'cashBeforeFinancing',
] as const;

export const BALANCE_KEYS = [
  'fixedAssetsGross', 'accumulatedDepreciation', 'fixedAssetsNet', 'inventory', 'receivables', 'vatDeductiblePending',
  'vatCreditAsset', 'incomeTaxReceivable', 'localTaxPrepaid', 'cashAsset', 'totalAssets',
  'capital', 'reserves', 'grantsNet', 'equity', 'loans', 'payables', 'vatCollectedPending', 'vatPayable',
  'incomeTaxPayable', 'socialPayable', 'localTaxPayable', 'overdraft', 'totalLiabilitiesAndEquity', 'balanceDiff',
  'cash', 'bfr', 'netDebt', 'currentDebtPortion', 'subscribers', 'headcount',
] as const;

export type FlowKey = (typeof FLOW_KEYS)[number];
export type BalanceKey = (typeof BALANCE_KEYS)[number];
export type LineKey = FlowKey | BalanceKey;

export type ProductDetail = {
  id: string; name: string; segment: string; channel: string; kind: 'one_time' | 'subscription';
  volume: number[]; newCustomers: number[]; revenue: Series; cogs: Series; vat: Series; cac: Series; capacity: (number | null)[];
};

export type LoanRow = { month: number; opening: Cents; interest: Cents; capitalized: Cents; principal: Cents; payment: Cents; closing: Cents };
export type LoanDetail = { id: string; name: string; kind: 'bank' | 'shareholder' | 'opening'; principal: Cents; fees: Cents; disbursementMonth: number; rows: LoanRow[] };
export type AssetDetail = { id: string; name: string; kind: string; cost: Cents; month: number; depreciation: Series; method: string; coefficient: number | null };
export type StaffDetail = { id: string; role: string; costCenter: string; headcount: number[]; gross: Series; employer: Series; ir: Series; net: Series };
export type ExpenseDetail = { id: string; name: string; category: string; costCenter: string; amount: Series };

export type IsYear = {
  fiscalYearIndex: number; label: string; openYear: number; months: number; partial: boolean;
  accountingResult: Cents; nonDeductible: Cents; taxableBeforeLosses: Cents; lossesUsed: Cents; lossesCarried: Cents; taxable: Cents;
  ratePct: number; rateStatus: RuleStatus | 'override'; rateDetail: string; computedTax: Cents; exemptionReduction: Cents;
  minimumContributionBase: Cents; minimumContributionRatePct: number; minimumContribution: Cents; minimumContributionExempt: boolean;
  minimumContributionApplied: boolean; taxDue: Cents; regime: string;
};

export type VatPeriod = {
  label: string; firstMonth: number; lastMonth: number; collected: Cents; deductible: Cents; creditBroughtForward: Cents;
  net: Cents; payable: Cents; creditCarriedForward: Cents; paymentMonth: number | null;
};

export type TaxPayment = { month: number; tax: string; label: string; amount: Cents };

export type EngineWarning = { code: string; message: string; severity: 'info' | 'warning' | 'error'; month?: number };

export type ChecksResult = {
  balanceSheetMaxAbsDiff: Cents;
  cashFlowMaxAbsDiff: Cents;
  planFinancementMaxAbsDiff: Cents;
  pnlMaxAbsDiff: Cents;
  ok: boolean;
};

export type StudyResult = {
  engineVersion: string;
  rulesVersion: string;
  scenarioId: string;
  calendar: Calendar;
  monthly: Record<LineKey, Series>;
  products: ProductDetail[];
  loans: LoanDetail[];
  assets: AssetDetail[];
  staff: StaffDetail[];
  expenses: ExpenseDetail[];
  isYears: IsYear[];
  vatPeriods: VatPeriod[];
  taxPayments: TaxPayment[];
  checks: ChecksResult;
  warnings: EngineWarning[];
};

// ─── Scenario levers ─────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Applies a scenario's levers to a model, returning a new model. Pure. */
export function applyLevers(model: StudyModel, levers: Levers): StudyModel {
  const f = (pct: number) => 1 + pct / 100;
  return {
    ...model,
    general: {
      ...model.general,
      inflationPct: model.general.inflationPct + levers.inflationDeltaPts,
      exchangeRates: model.general.exchangeRates.map((x) => ({ ...x, rateToMad: x.rateToMad * f(levers.exchangeRateFactorPct) })),
    },
    products: model.products.map((p) => ({
      ...p,
      unitPrice: p.unitPrice * f(levers.priceFactorPct),
      volumeMonth1: p.volumeMonth1 * f(levers.volumeFactorPct),
      volumeGrowthPct: p.volumeGrowthPct.map((g) => g + levers.revenueGrowthDeltaPts),
      unitCost: p.unitCost * f(levers.unitCostFactorPct),
      capacityPerMonth: p.capacityPerMonth == null ? null : p.capacityPerMonth * f(levers.capacityFactorPct),
      utilizationPct: clamp(p.utilizationPct + levers.utilizationDeltaPts, 0, 100),
      launchMonth: Math.max(0, p.launchMonth + levers.launchDelayMonths + (p.phase === 'expansion' ? levers.expansionDelayMonths : 0)),
      endMonth: p.endMonth,
      overrides: Object.fromEntries(Object.entries(p.overrides).map(([k, o]) => [k, {
        ...(o.volume != null ? { volume: o.volume * f(levers.volumeFactorPct) } : {}),
        ...(o.price != null ? { price: o.price * f(levers.priceFactorPct) } : {}),
      }])),
    })),
    expenses: model.expenses.map((e) => ({
      ...e, amountMonthly: e.amountMonthly * f(levers.opexFactorPct), pctOfRevenue: e.pctOfRevenue * f(levers.opexFactorPct),
    })),
    staff: model.staff.map((s) => ({ ...s, headcount: s.headcount * f(levers.headcountFactorPct), grossMonthly: s.grossMonthly * f(levers.wageFactorPct) })),
    investments: model.investments.map((i) => ({
      ...i, amountHT: i.amountHT * f(levers.capexFactorPct),
      month: Math.max(0, i.month + (i.phase === 'expansion' ? levers.expansionDelayMonths : 0)),
    })),
    financing: {
      ...model.financing,
      loans: model.financing.loans.map((l) => ({
        ...l, principal: l.principal * f(levers.loanAmountFactorPct), annualRatePct: Math.max(0, l.annualRatePct + levers.interestDeltaPts),
        termMonths: Math.max(1, l.termMonths + levers.loanTermDeltaMonths), graceMonths: Math.min(l.graceMonths, Math.max(0, l.termMonths + levers.loanTermDeltaMonths - 1)),
      })),
    },
    workingCapital: {
      ...model.workingCapital,
      dsoDays: Math.max(0, model.workingCapital.dsoDays + levers.dsoDeltaDays),
      dpoDays: Math.max(0, model.workingCapital.dpoDays + levers.dpoDeltaDays),
      inventoryDays: Math.max(0, model.workingCapital.inventoryDays + levers.inventoryDeltaDays),
    },
  };
}

export function scenarioLevers(model: StudyModel, scenarioId?: string): { id: string; levers: Levers } {
  const s = model.scenarios.find((x) => x.id === (scenarioId ?? model.activeScenarioId)) ?? model.scenarios[0];
  return s ? { id: s.id, levers: s.levers } : { id: 'base', levers: NEUTRAL_LEVERS };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────────

function zeros(n: number): Series {
  return new Array<number>(n).fill(0);
}

/** Splits an amount due after `days` into the two months it straddles (30-day months). */
function delaySplit(amount: Cents, days: number): { k: number; first: Cents; second: Cents } {
  const k = Math.floor(days / 30);
  const r = (days % 30) / 30;
  const first = roundHalfAwayFromZero(amount * (1 - r));
  return { k, first, second: amount - first };
}

function growth(pct: number, years: number): number {
  return Math.pow(1 + pct / 100, years);
}

function seasonWeights(season: number[]): number[] {
  const mean = season.reduce((s, v) => s + v, 0) / 12;
  return mean > 0 ? season.map((v) => v / mean) : season.map(() => 1);
}

/** Schedules a TTC/VAT pair paid after `days`, from month `s`, into payment arrays. */
function schedulePayment(
  ttc: Cents, vat: Cents, s: number, days: number, N: number, paid: Series, vatPaid: Series,
): void {
  if (ttc === 0 && vat === 0) return;
  const { k, first, second } = delaySplit(ttc, days);
  const vFirst = ttc !== 0 ? roundHalfAwayFromZero((vat * first) / ttc) : 0;
  const m1 = s + k;
  const m2 = s + k + 1;
  if (m1 < N) { paid[m1] += first; vatPaid[m1] += vFirst; }
  if (m2 < N) { paid[m2] += second; vatPaid[m2] += vat - vFirst; }
}

// ─── Engine ──────────────────────────────────────────────────────────────────────────────────────

export function computeStudy(input: StudyModel, scenarioId?: string): StudyResult {
  const { id: activeScenario, levers } = scenarioLevers(input, scenarioId);
  const model = applyLevers(input, levers);
  const cal = buildCalendar(model.horizon.startMonth, model.horizon.years, model.horizon.fiscalYearStartMonth);
  const N = cal.months;
  const F = cal.fiscalYears.length;
  const warnings: EngineWarning[] = [];
  const M = {} as Record<LineKey, Series>;
  for (const k of FLOW_KEYS) M[k] = zeros(N);
  for (const k of BALANCE_KEYS) M[k] = zeros(N);

  const tax = model.tax;
  const vatOn = tax.vatSubject;
  const wc = model.workingCapital;
  const ob = model.openingBalance.enabled ? model.openingBalance : null;
  const inflation = model.general.inflationPct;
  const fx = (currency: string, y: number): number => {
    if (currency === 'MAD') return 1;
    const r = model.general.exchangeRates.find((x) => x.currency === currency);
    return r ? r.rateToMad * growth(r.annualChangePct, y) : 0;
  };
  const dateOf = (m: number) => `${cal.labels[m]}-01`;
  const vatWarned = new Set<string>();
  const checkVat = (rate: number, m: number, what: string) => {
    if (!vatOn || m >= N) return;
    const key = `${what}|${rate}|${cal.calYear[m]}`;
    if (vatWarned.has(key) || isLegalVatRate(rate, dateOf(m))) return;
    vatWarned.add(key);
    warnings.push({ code: 'vat_rate_not_legal', severity: 'warning', month: m, message: `${what} : taux de TVA ${rate} % non prévu par le CGI pour ${cal.calYear[m]} (art. 99 / 247-XXXXI).` });
  };

  // Payment pipelines.
  const supplierPaid = zeros(N);
  const supplierVatPaid = zeros(N);
  const opexPaid = zeros(N);
  const opexVatPaid = zeros(N);
  const vatDedInvoiced = zeros(N);
  const payablesInvoiced = zeros(N);

  // ── Revenue, cost of sales, inventory, collections ──
  const collections = zeros(N);
  const vatOnCollections = zeros(N);
  const badDebtTtc = zeros(N);
  const badDebtVat = zeros(N);
  const salesTtc = zeros(N);
  const products: ProductDetail[] = [];
  const subscribersTotal = new Array<number>(N).fill(0);
  const openingInventory = ob ? toCents(ob.inventory) : 0;
  const openingStockProduct = model.products.findIndex((p) => p.unitCost > 0);

  for (const [pIndex, p] of model.products.entries()) {
    const season = seasonWeights(p.seasonality);
    const det: ProductDetail = {
      id: p.id, name: p.name, segment: p.segment, channel: p.channel, kind: p.kind,
      volume: new Array<number>(N).fill(0), newCustomers: new Array<number>(N).fill(0), revenue: zeros(N), cogs: zeros(N), vat: zeros(N), cac: zeros(N),
      capacity: new Array<number | null>(N).fill(null),
    };
    const inv = zeros(N);
    let invPrev = pIndex === openingStockProduct ? openingInventory : 0;
    let active = 0;
    const purchaseVatRate = p.purchaseVatRatePct;
    for (let m = 0; m < N; m += 1) {
      const on = m >= p.launchMonth && (p.endMonth == null || m <= p.endMonth);
      const y = Math.floor(m / 12);
      let gross = 0;
      let net = 0;
      let cogs = 0;
      if (on) {
        const k = Math.floor((m - p.launchMonth) / 12);
        let gf = 1;
        for (let j = 0; j < k; j += 1) gf *= 1 + (p.volumeGrowthPct[Math.min(j, p.volumeGrowthPct.length - 1)] ?? 0) / 100;
        const sw = season[cal.calMonth[m] - 1];
        const ov = p.overrides[String(m)];
        const rate = fx(p.currency, y);
        const price = (ov?.price ?? p.unitPrice * growth(p.priceGrowthPct, y)) * rate;
        const cap = p.capacityPerMonth == null ? null : (p.capacityPerMonth * p.utilizationPct) / 100;
        det.capacity[m] = p.capacityPerMonth;
        let units: number;
        if (p.kind === 'subscription') {
          const fresh = ov?.volume ?? p.volumeMonth1 * gf * sw;
          active = active * (1 - p.churnPctMonthly / 100) + fresh;
          if (cap != null) active = Math.min(active, cap);
          det.newCustomers[m] = fresh;
          units = active;
          const cac = toCents(fresh * p.cacPerCustomer);
          det.cac[m] = cac;
        } else {
          units = ov?.volume ?? p.volumeMonth1 * gf * sw;
          if (cap != null) units = Math.min(units, cap);
        }
        det.volume[m] = units;
        gross = toCents(price * units);
        const discount = applyRate(gross, p.discountPct);
        const returned = applyRate(gross - discount, p.returnsPct);
        net = gross - discount - returned;
        M.discounts[m] += discount;
        M.returns[m] += returned;
        const costUnits = p.kind === 'subscription' ? units : units * (1 - p.returnsPct / 100);
        cogs = toCents(p.unitCost * growth(p.unitCostGrowthPct, y) * costUnits);
        if (p.kind === 'subscription') subscribersTotal[m] += units;
      } else if (p.kind === 'subscription' && active > 0) {
        active = 0;
      }
      M.revenueGross[m] += gross;
      det.revenue[m] = net;
      det.cogs[m] = cogs;
      const vat = vatOn ? applyRate(net, p.vatRatePct) : 0;
      if (net !== 0) checkVat(p.vatRatePct, m, `Produit « ${p.name} »`);
      det.vat[m] = vat;
      const ttc = net + vat;
      salesTtc[m] += ttc;
      M.vatInvoicedSales[m] += vat;

      // Collections: cash share now, the rest after DSO; bad debts written off when invoiced.
      const cashPart = applyRate(ttc, wc.cashSalesPct);
      const vatCash = ttc !== 0 ? roundHalfAwayFromZero((vat * cashPart) / ttc) : 0;
      collections[m] += cashPart;
      vatOnCollections[m] += vatCash;
      const credit = ttc - cashPart;
      const vatCredit = vat - vatCash;
      const bad = applyRate(credit, wc.badDebtPct);
      const vatBad = credit !== 0 ? roundHalfAwayFromZero((vatCredit * bad) / credit) : 0;
      badDebtTtc[m] += bad;
      badDebtVat[m] += vatBad;
      const collectible = credit - bad;
      const vatCollectible = vatCredit - vatBad;
      if (collectible !== 0 || vatCollectible !== 0) {
        const { k, first, second } = delaySplit(collectible, wc.dsoDays);
        const vFirst = collectible !== 0 ? roundHalfAwayFromZero((vatCollectible * first) / collectible) : vatCollectible;
        if (m + k < N) { collections[m + k] += first; vatOnCollections[m + k] += vFirst; }
        if (m + k + 1 < N) { collections[m + k + 1] += second; vatOnCollections[m + k + 1] += vatCollectible - vFirst; }
      }

      // Inventory and purchases (per product, so each keeps its purchase VAT rate).
      const target = roundHalfAwayFromZero((cogs * wc.inventoryDays) / 30);
      const purchase = Math.max(0, cogs + target - invPrev);
      inv[m] = invPrev + purchase - cogs;
      invPrev = inv[m];
      // Without VAT deduction the purchase VAT is a cost of the month (stock stays valued excluding VAT).
      const purchaseCost = vatOn ? purchase : purchase + applyRate(purchase, purchaseVatRate);
      M.purchases[m] += purchaseCost;
      const pVat = vatOn ? applyRate(purchase, purchaseVatRate) : 0;
      if (purchase !== 0 && vatOn) checkVat(purchaseVatRate, m, `Achats « ${p.name} »`);
      vatDedInvoiced[m] += pVat;
      payablesInvoiced[m] += purchaseCost + pVat;
      schedulePayment(purchaseCost + pVat, pVat, m, wc.dpoDays, N, supplierPaid, supplierVatPaid);

      // CAC is a marketing charge.
      if (det.cac[m] !== 0) {
        const cac = det.cac[m];
        const cVat = vatOn ? applyRate(cac, purchaseVatRate) : 0;
        const cost = vatOn ? cac : cac + applyRate(cac, purchaseVatRate);
        M.cacCharges[m] += cost;
        M.variableOpex[m] += cost;
        vatDedInvoiced[m] += cVat;
        payablesInvoiced[m] += cost + cVat;
        schedulePayment(cost + cVat, cVat, m, wc.dpoDays, N, opexPaid, opexVatPaid);
      }
    }
    for (let m = 0; m < N; m += 1) {
      M.revenue[m] += det.revenue[m];
      M.cogs[m] += det.cogs[m];
      M.inventory[m] += inv[m];
    }
    products.push(det);
  }

  if (openingInventory > 0 && openingStockProduct < 0) {
    for (let m = 0; m < N; m += 1) M.inventory[m] += openingInventory;
    warnings.push({ code: 'opening_inventory_static', severity: 'info', message: 'Stock d’ouverture conservé tel quel : aucun produit avec un coût unitaire pour le consommer.' });
  }
  for (let m = 0; m < N; m += 1) {
    const prev = m === 0 ? openingInventory : M.inventory[m - 1];
    // Achats consommés = achats + variation de stock; the variation is the opposite of the stock change.
    M.inventoryVariation[m] = -(M.inventory[m] - prev);
    M.cogs[m] = M.purchases[m] + M.inventoryVariation[m];
  }

  // ── Operating expenses ──
  const expenses: ExpenseDetail[] = [];
  for (const e of model.expenses) {
    const det: ExpenseDetail = { id: e.id, name: e.name, category: e.category, costCenter: e.costCenter, amount: zeros(N) };
    const g = e.growthPct + (e.indexedOnInflation ? inflation : 0);
    const deductible = vatOn && e.vatDeductible;
    // CGNC 612: consumed materials and supplies are purchases (achats consommés), not other external charges.
    const consumed = e.category === 'raw_materials';
    for (let m = e.startMonth; m < N && (e.endMonth == null || m <= e.endMonth); m += 1) {
      const y = Math.floor(m / 12);
      const ht = e.behavior === 'fixed'
        ? toCents(e.amountMonthly * growth(g, y))
        : applyRate(M.revenue[m], e.pctOfRevenue);
      if (ht === 0) continue;
      const vat = applyRate(ht, e.vatRatePct);
      if (e.vatRatePct > 0) checkVat(e.vatRatePct, m, `Charge « ${e.name} »`);
      const cost = deductible ? ht : ht + vat;
      det.amount[m] = cost;
      if (consumed) {
        M.purchases[m] += cost;
        M.cogs[m] += cost;
      } else {
        M.externalCharges[m] += cost;
        if (e.behavior === 'fixed') M.fixedOpex[m] += cost; else M.variableOpex[m] += cost;
      }
      const dVat = deductible ? vat : 0;
      vatDedInvoiced[m] += dVat;
      payablesInvoiced[m] += ht + vat;
      schedulePayment(ht + vat, dVat, m, e.paymentDelayDays ?? wc.dpoDays, N, opexPaid, opexVatPaid);
    }
    expenses.push(det);
  }
  for (let m = 0; m < N; m += 1) M.externalCharges[m] += M.cacCharges[m];

  // ── Leasing (crédit-bail): rent is an external charge; the purchase option becomes an asset ──
  const leaseAssets: Investment[] = [];
  for (const l of model.financing.leases) {
    const deductible = vatOn;
    for (let m = l.startMonth; m < Math.min(N, l.startMonth + l.termMonths); m += 1) {
      const ht = toCents(l.monthlyRentHT);
      const vat = applyRate(ht, l.vatRatePct);
      const cost = deductible ? ht : ht + vat;
      M.leaseCharges[m] += cost;
      M.externalCharges[m] += cost;
      M.fixedOpex[m] += cost;
      const dVat = deductible ? vat : 0;
      vatDedInvoiced[m] += dVat;
      payablesInvoiced[m] += ht + vat;
      schedulePayment(ht + vat, dVat, m, 0, N, opexPaid, opexVatPaid);
    }
    const optionMonth = l.startMonth + l.termMonths;
    if (l.purchaseOptionHT > 0 && optionMonth < N) {
      leaseAssets.push({
        id: `${l.id}_option`, name: `${l.name} (levée d’option)`, kind: 'tangible', phase: 'initial', amountHT: l.purchaseOptionHT,
        vatRatePct: l.vatRatePct, vatRecoverable: true, month: optionMonth, usefulLifeYears: l.optionAssetLifeYears, method: 'linear', decliningCoefficient: 2,
      });
    }
  }

  // ── Payroll ──
  const staff: StaffDetail[] = [];
  const socialAccrued = zeros(N);
  const irAccrued = zeros(N);
  for (const s of model.staff) {
    const det: StaffDetail = {
      id: s.id, role: s.role, costCenter: s.costCenter, headcount: new Array<number>(N).fill(0),
      gross: zeros(N), employer: zeros(N), ir: zeros(N), net: zeros(N),
    };
    for (let m = s.startMonth; m < N && (s.endMonth == null || m <= s.endMonth); m += 1) {
      if (s.headcount <= 0 || s.grossMonthly <= 0) continue;
      const ys = Math.floor((m - s.startMonth) / 12);
      const slip = monthlyPayroll(s.grossMonthly * growth(s.annualRaisePct, ys), s.dependants, cal.calYear[m]);
      const hc = s.headcount;
      const gross = toCents(slip.gross * hc);
      const cnssE = toCents(slip.cnssEmployee * hc);
      const amoE = toCents(slip.amoEmployee * hc);
      const ir = toCents(slip.ir * hc);
      const employer = toCents(slip.cnssEmployer * hc) + toCents(slip.amoEmployer * hc) + toCents(slip.tfpEmployer * hc);
      const net = gross - cnssE - amoE - ir;
      det.headcount[m] = hc;
      det.gross[m] = gross;
      det.employer[m] = employer;
      det.ir[m] = ir;
      det.net[m] = net;
      M.salaries[m] += gross;
      M.employerCharges[m] += employer;
      M.netSalaries[m] += net;
      M.employeeSocial[m] += cnssE + amoE;
      M.irSalarial[m] += ir;
      M.headcount[m] += hc;
      socialAccrued[m] += cnssE + amoE + employer;
      irAccrued[m] += ir;
    }
    staff.push(det);
  }

  // ── Investments and depreciation ──
  const assets: AssetDetail[] = [];
  const capexVatDeductible = zeros(N);
  const allInvestments = [...model.investments, ...leaseAssets];
  for (const inv of allInvestments) {
    if (inv.amountHT <= 0 || inv.month >= N) continue;
    const ht = toCents(inv.amountHT);
    const vat = applyRate(ht, inv.vatRatePct);
    if (inv.vatRatePct > 0) checkVat(inv.vatRatePct, inv.month, `Investissement « ${inv.name} »`);
    const recoverable = vatOn && inv.vatRecoverable;
    const cost = recoverable ? ht : ht + vat;
    M.capexCost[inv.month] += cost;
    M.capexVat[inv.month] += vat;
    M.cashOutCapex[inv.month] += ht + vat;
    if (recoverable) capexVatDeductible[inv.month] += vat;
    const dep = zeros(N);
    let coefficient: number | null = null;
    const depreciable = inv.kind === 'tangible' || inv.kind === 'intangible';
    if (depreciable && inv.usefulLifeYears > 0) {
      const L = inv.usefulLifeYears;
      if (inv.method === 'declining') {
        coefficient = inv.decliningCoefficient;
        const legal = legalDecliningCoefficient(L);
        if (legal != null && Math.abs(legal - coefficient) > 1e-9) {
          warnings.push({ code: 'declining_coefficient', severity: 'info', message: `« ${inv.name} » : coefficient dégressif ${coefficient} saisi ; le CGI (art. 10) prévoit ${legal} pour ${L} ans.` });
        }
        let nbv = cost;
        for (let j = 0; j < L; j += 1) {
          const decl = roundHalfAwayFromZero((nbv * coefficient) / L);
          const lin = roundHalfAwayFromZero(nbv / (L - j));
          const annual = j === L - 1 ? nbv : Math.min(nbv, Math.max(decl, lin));
          const parts = allocate(annual, new Array(12).fill(1));
          for (let q = 0; q < 12; q += 1) {
            const m = inv.month + j * 12 + q;
            if (m < N) dep[m] += parts[q];
          }
          nbv -= annual;
        }
      } else {
        const parts = allocate(cost, new Array(L * 12).fill(1));
        for (let q = 0; q < parts.length; q += 1) {
          const m = inv.month + q;
          if (m < N) dep[m] += parts[q];
        }
      }
    }
    for (let m = 0; m < N; m += 1) M.depreciation[m] += dep[m];
    assets.push({ id: inv.id, name: inv.name, kind: inv.kind, cost, month: inv.month, depreciation: dep, method: inv.method, coefficient });
  }
  let openingFixedGross = 0;
  let openingAccDep = 0;
  if (ob && ob.fixedAssetsGross > 0) {
    openingFixedGross = toCents(ob.fixedAssetsGross);
    openingAccDep = toCents(ob.accumulatedDepreciation);
    const nbv = openingFixedGross - openingAccDep;
    const dep = zeros(N);
    if (nbv > 0 && ob.remainingLifeYears > 0) {
      const parts = allocate(nbv, new Array(ob.remainingLifeYears * 12).fill(1));
      for (let q = 0; q < parts.length && q < N; q += 1) dep[q] += parts[q];
    }
    for (let m = 0; m < N; m += 1) M.depreciation[m] += dep[m];
    assets.push({ id: 'opening', name: 'Immobilisations existantes (bilan d’ouverture)', kind: 'tangible', cost: nbv, month: 0, depreciation: dep, method: 'linear', coefficient: null });
  }

  // ── Loans ──
  const loans: LoanDetail[] = [];
  const buildLoan = (l: Loan | { id: string; name: string; kind: 'opening'; principal: number; month: number; annualRatePct: number; termMonths: number; graceMonths: number; graceType: 'interest_only'; method: 'annuity'; feesPct: number }, firstInstallment: number, disburse: boolean): void => {
    const P = toCents(l.principal);
    if (P <= 0) return;
    const r = l.annualRatePct / 100 / 12;
    const fees = applyRate(P, l.feesPct);
    const rows: LoanRow[] = [];
    if (disburse && l.month < N) {
      M.cashInLoans[l.month] += P;
      M.loanFees[l.month] += fees;
      M.cashOutInterest[l.month] += fees;
    }
    let bal = P;
    let payment = 0;
    let constantPrincipal: Cents[] = [];
    const amortStart = l.graceMonths;
    for (let i = 0; i < l.termMonths && bal > 0; i += 1) {
      const m = firstInstallment + i;
      const opening = bal;
      const interest = roundHalfAwayFromZero(bal * r);
      let principal = 0;
      let capitalized = 0;
      if (i < amortStart) {
        if (l.graceType === 'capitalized') { capitalized = interest; bal += interest; }
      } else {
        const n = l.termMonths - amortStart;
        if (i === amortStart) {
          if (l.method === 'annuity') payment = r === 0 ? roundHalfAwayFromZero(bal / n) : roundHalfAwayFromZero((bal * r) / (1 - Math.pow(1 + r, -n)));
          if (l.method === 'constant_principal') constantPrincipal = allocate(bal, new Array(n).fill(1));
        }
        const last = i === l.termMonths - 1;
        if (l.method === 'annuity') principal = last ? bal : Math.min(bal, payment - interest);
        else if (l.method === 'constant_principal') principal = last ? bal : Math.min(bal, constantPrincipal[i - amortStart]);
        else principal = last ? bal : 0;
        bal -= principal;
      }
      const cashInterest = interest - capitalized;
      rows.push({ month: m, opening, interest, capitalized, principal, payment: cashInterest + principal, closing: bal });
      if (m >= 0 && m < N) {
        M.interest[m] += interest;
        M.capitalizedInterest[m] += capitalized;
        M.cashOutInterest[m] += cashInterest;
        M.cashOutPrincipal[m] += principal;
      }
    }
    loans.push({ id: l.id, name: l.name, kind: l.kind, principal: P, fees, disbursementMonth: l.month, rows });
  };
  for (const l of model.financing.loans) buildLoan(l, l.month + 1, true);
  if (ob && ob.debtBalance > 0 && ob.debtRemainingMonths > 0) {
    buildLoan({
      id: 'opening_debt', name: 'Dette existante (bilan d’ouverture)', kind: 'opening', principal: ob.debtBalance, month: -1,
      annualRatePct: ob.debtAnnualRatePct, termMonths: ob.debtRemainingMonths, graceMonths: 0, graceType: 'interest_only', method: 'annuity', feesPct: 0,
    }, 0, false);
  }
  for (let m = 0; m < N; m += 1) {
    let bal = 0;
    let nextYear = 0;
    for (const ln of loans) {
      if (ln.disbursementMonth > m) continue;
      let b = ln.principal;
      for (const row of ln.rows) {
        if (row.month > m) {
          if (row.month <= m + 12) nextYear += row.principal;
          continue;
        }
        b = row.closing;
      }
      bal += b;
    }
    M.loans[m] = bal;
    M.currentDebtPortion[m] = nextYear;
  }

  // ── Grants and equity ──
  const grantRelease = zeros(N);
  const grantsReceived = zeros(N);
  for (const g of model.financing.grants) {
    if (g.month >= N) continue;
    const amt = toCents(g.amount);
    if (g.kind === 'operating') {
      M.operatingGrants[g.month] += amt;
      M.cashInGrants[g.month] += amt;
    } else {
      M.cashInGrants[g.month] += amt;
      M.cashInInvestmentGrants[g.month] += amt;
      grantsReceived[g.month] += amt;
      const parts = allocate(amt, new Array(g.amortizationYears * 12).fill(1));
      for (let q = 0; q < parts.length; q += 1) if (g.month + q < N) grantRelease[g.month + q] += parts[q];
    }
  }
  for (const e of model.financing.equity) if (e.month < N) M.cashInEquity[e.month] += toCents(e.amount);
  M.grantRelease = grantRelease;

  // ── Local taxes ──
  const localAccrued = zeros(N);
  const localPaid = zeros(N);
  for (const lt of tax.localTaxes) {
    for (const fy of cal.fiscalYears) {
      const fi = fy.index + 1;
      if (fi < lt.startFiscalYearIndex || fi < lt.startFiscalYearIndex + lt.exemptYears) continue;
      if (lt.base === 'investment') {
        for (let m = fy.firstMonth; m <= fy.lastMonth; m += 1) {
          const amt = applyRate(M.capexCost[m], lt.ratePct);
          localAccrued[m] += amt;
          localPaid[m] += amt;
        }
        continue;
      }
      let annual: Cents;
      if (lt.base === 'fixed') annual = toCents(lt.amount);
      else if (lt.base === 'rental_value') annual = applyRate(toCents(lt.baseAmount), lt.ratePct);
      else {
        let rev = 0;
        for (let m = fy.firstMonth; m <= fy.lastMonth; m += 1) rev += M.revenue[m];
        annual = applyRate(rev, lt.ratePct);
      }
      const amount = lt.base === 'revenue' ? annual : roundHalfAwayFromZero((annual * fy.months) / 12);
      const parts = allocate(amount, new Array(fy.months).fill(1));
      for (let q = 0; q < fy.months; q += 1) localAccrued[fy.firstMonth + q] += parts[q];
      const payAt = Math.min(fy.lastMonth, Math.max(fy.firstMonth, fy.startOffset + lt.paymentMonthOfFiscalYear - 1));
      localPaid[payAt] += amount;
    }
  }
  M.localTaxes = localAccrued;
  M.cashOutLocalTaxes = localPaid;

  // ── Pre-cash income statement components ──
  for (let m = 0; m < N; m += 1) {
    const badHt = tax.vatRegime === 'encaissement' && vatOn ? badDebtTtc[m] - badDebtVat[m] : badDebtTtc[m];
    M.badDebts[m] = badHt;
  }

  // ── VAT schedule helpers ──
  const vatCollectedDue = zeros(N);
  for (let m = 0; m < N; m += 1) {
    vatCollectedDue[m] = !vatOn ? 0 : tax.vatRegime === 'debit' ? M.vatInvoicedSales[m] : vatOnCollections[m];
  }
  const vatDeductible = zeros(N);
  for (let m = 0; m < N; m += 1) vatDeductible[m] = supplierVatPaid[m] + opexVatPaid[m] + capexVatDeductible[m];
  M.vatCollectedDue = vatCollectedDue;
  M.vatDeductible = vatDeductible;

  // VAT periods by calendar year according to art. 108.
  const activityCalYear = cal.calYear[Math.max(0, Math.min(N - 1, tax.activityStartMonth))] ?? cal.calYear[0];
  const yearRevenue = new Map<number, Cents>();
  for (let m = 0; m < N; m += 1) yearRevenue.set(cal.calYear[m], (yearRevenue.get(cal.calYear[m]) ?? 0) + M.revenue[m]);
  const periodicityFor = (cy: number): 'monthly' | 'quarterly' => {
    if (tax.vatPeriodicity !== 'auto') return tax.vatPeriodicity;
    if (model.projectType === 'creation' && cy <= activityCalYear) return 'quarterly';
    const prev = yearRevenue.get(cy - 1);
    if (prev == null) {
      const first = yearRevenue.get(cy) ?? 0;
      return first >= toCents(1_000_000) ? 'monthly' : 'quarterly';
    }
    return prev >= toCents(1_000_000) ? 'monthly' : 'quarterly';
  };
  const periodEnd = new Array<boolean>(N).fill(false);
  const periodLabel = new Array<string>(N).fill('');
  for (let m = 0; m < N; m += 1) {
    const cy = cal.calYear[m];
    const cm = cal.calMonth[m];
    const per = periodicityFor(cy);
    if (per === 'monthly') { periodEnd[m] = true; periodLabel[m] = cal.labels[m]; }
    else if (cm % 3 === 0) { periodEnd[m] = true; periodLabel[m] = `${cy}-T${cm / 3}`; }
    if (m === N - 1) { periodEnd[m] = true; periodLabel[m] = periodLabel[m] || `${cal.labels[m]} (fin d’horizon)`; }
  }

  // ── Sequential pass: overdraft interest, IS, VAT settlement, dividends, cash and balances ──
  const vatPeriods: VatPeriod[] = [];
  const taxPayments: TaxPayment[] = [];
  const isYears: IsYear[] = [];
  const vatPay = zeros(N);
  const isPay = zeros(N);
  const socialPay = zeros(N);
  const irPay = zeros(N);
  const divPay = zeros(N);
  const divWh = zeros(N);
  const divGross = zeros(N);
  const isExpense = zeros(N);

  // Opening liabilities settled at the start.
  if (ob) {
    const opRec = toCents(ob.receivables);
    if (opRec > 0) {
      const months = Math.max(1, Math.round(wc.dsoDays / 30) || 1);
      allocate(opRec, new Array(Math.min(months, N)).fill(1)).forEach((v, i) => { collections[i] += v; });
    }
    const opPay = toCents(ob.payables);
    if (opPay > 0) {
      const months = Math.max(1, Math.round(wc.dpoDays / 30) || 1);
      allocate(opPay, new Array(Math.min(months, N)).fill(1)).forEach((v, i) => { supplierPaid[i] += v; });
    }
    if (ob.socialPayable > 0) socialPay[0] += toCents(ob.socialPayable);
    if (ob.isPayable > 0) {
      const at = Math.min(N - 1, 2);
      isPay[at] += toCents(ob.isPayable);
      taxPayments.push({ month: at, tax: 'IS', label: 'Solde IS de l’exercice antérieur (bilan d’ouverture)', amount: toCents(ob.isPayable) });
    }
  }
  for (let m = 0; m < N; m += 1) {
    if (m + 1 < N) { socialPay[m + 1] += socialAccrued[m]; irPay[m + 1] += irAccrued[m]; }
  }

  let cash = ob ? toCents(ob.cash) : 0;
  let vatCreditCarry = ob ? toCents(ob.vatCredit) : 0;
  let vatOpeningDue = ob ? toCents(ob.vatPayable) : 0;
  let periodCollected = 0;
  let periodDeductible = 0;
  let periodStart = 0;
  let ebtFy = 0;
  let cmBaseFy = 0;
  let isCredit = 0;
  const losses: { fy: number; remaining: Cents }[] = [];
  const isDueByFy: Cents[] = [];
  const acomptesPaidByFy: Cents[] = new Array(F + 1).fill(0);
  const netIncomeByFy: Cents[] = new Array(F).fill(0);
  let reserves = ob ? toCents(ob.reserves) : 0;
  let capital = ob ? toCents(ob.capital) : 0;
  let grantsNet = 0;
  let receivables = ob ? toCents(ob.receivables) : 0;
  let payables = ob ? toCents(ob.payables) : 0;
  let vatDedPending = 0;
  let vatCollPending = 0;
  let vatNet = (ob ? toCents(ob.vatPayable) - toCents(ob.vatCredit) : 0);
  let isNet = ob ? toCents(ob.isPayable) : 0;
  let social = ob ? toCents(ob.socialPayable) : 0;
  let localNet = 0;
  let fixedGross = openingFixedGross;
  let accDep = openingAccDep;
  const incorporationOffset = (() => {
    const d = model.profile.company.incorporationDate;
    if (!/^\d{4}-\d{2}/.test(d)) return tax.activityStartMonth;
    const [iy, im] = d.split('-').map(Number);
    const [sy, sm] = model.horizon.startMonth.split('-').map(Number);
    return (iy - sy) * 12 + (im - sm);
  })();

  // Acomptes for the first fiscal year from the prior year's tax, when the horizon starts with it.
  if (ob && ob.priorYearIsDue > 0 && tax.regime === 'is') {
    const fy0 = cal.fiscalYears[0];
    if (fy0.startOffset === 0) {
      const a = applyRate(toCents(ob.priorYearIsDue), 25);
      for (const q of [2, 5, 8, 11]) if (q < N && q <= fy0.lastMonth) { isPay[q] += a; acomptesPaidByFy[0] += a; taxPayments.push({ month: q, tax: 'IS', label: `Acompte IS ${fy0.label}`, amount: a }); }
    } else {
      warnings.push({ code: 'acomptes_first_year', severity: 'info', message: 'L’horizon ne commence pas au début de l’exercice : les acomptes du premier exercice ne sont pas projetés.' });
    }
  }

  const rateOverrideFor = (openYear: number): { isRate: number | null; cmRate: number | null } => {
    const applicable = tax.overrides.filter((o) => o.fromFiscalYear <= openYear).sort((a, b) => b.fromFiscalYear - a.fromFiscalYear);
    return {
      isRate: applicable.find((o) => o.isRatePct != null)?.isRatePct ?? null,
      cmRate: applicable.find((o) => o.minimumContributionRatePct != null)?.minimumContributionRatePct ?? null,
    };
  };

  for (let m = 0; m < N; m += 1) {
    const fi = cal.fiscalIndex[m];
    const fy = cal.fiscalYears[fi];

    // Overdraft interest on the previous month's negative balance.
    const od = cash < 0 && model.financing.overdraftRatePct > 0 ? applyRate(-cash, model.financing.overdraftRatePct / 12) : 0;
    M.overdraftInterest[m] = od;
    M.cashOutInterest[m] += od;

    // Income statement for the month (income tax added at fiscal year end).
    M.ebitda[m] = M.revenue[m] + M.operatingGrants[m] - M.cogs[m] - M.externalCharges[m] - M.localTaxes[m] - M.salaries[m] - M.employerCharges[m];
    M.ebit[m] = M.ebitda[m] - M.depreciation[m];
    M.financialCharges[m] = M.interest[m] + M.loanFees[m] + od;
    M.financialResult[m] = -M.financialCharges[m];
    M.nonCurrentResult[m] = M.grantRelease[m] - M.badDebts[m];
    M.ebt[m] = M.ebit[m] + M.financialResult[m] + M.nonCurrentResult[m];
    ebtFy += M.ebt[m];
    cmBaseFy += M.revenue[m] + M.operatingGrants[m] + M.grantRelease[m];

    // Auto-entrepreneur: tax on turnover, accrued monthly, paid the month after each quarter.
    if (tax.regime === 'auto_entrepreneur') {
      const t = applyRate(M.revenue[m], tax.autoEntrepreneurRatePct);
      isExpense[m] += t;
      if (cal.calMonth[m] % 3 === 0 || m === N - 1) {
        let q = 0;
        for (let k = m; k >= 0 && (k === m || cal.calMonth[k] % 3 !== 0); k -= 1) q += isExpense[k];
        if (m + 1 < N && q > 0) { isPay[m + 1] += q; taxPayments.push({ month: m + 1, tax: 'IR', label: `Impôt auto-entrepreneur ${cal.quarterLabels[cal.quarterIndex[m]]}`, amount: q }); }
      }
    }

    // Fiscal year close: IS or professional IR.
    if (m === fy.lastMonth && tax.regime !== 'auto_entrepreneur') {
      const nonDed = toCents(tax.nonDeductibleByFiscalYear[fi] ?? 0);
      const before = ebtFy + nonDed;
      for (let i = losses.length - 1; i >= 0; i -= 1) if (fi - losses[i].fy > tax.lossCarryforwardYears) losses.splice(i, 1);
      let used = 0;
      let taxable = 0;
      if (before > 0) {
        let rest = before;
        for (const l of losses) {
          const u = Math.min(rest, l.remaining);
          l.remaining -= u;
          rest -= u;
          used += u;
          if (rest === 0) break;
        }
        for (let i = losses.length - 1; i >= 0; i -= 1) if (losses[i].remaining === 0) losses.splice(i, 1);
        taxable = rest;
      } else if (before < 0) {
        losses.push({ fy: fi, remaining: -before });
      }
      const carried = losses.reduce((s, l) => s + l.remaining, 0);
      const ov = rateOverrideFor(fy.openYear);
      let ratePct = 0;
      let rateStatus: IsYear['rateStatus'] = 'verified_official';
      let rateDetail = '';
      let computed = 0;
      const isRegime = tax.regime === 'is';
      if (isRegime) {
        if (levers.isRateOverridePct != null) { ratePct = levers.isRateOverridePct; rateStatus = 'override'; rateDetail = 'Taux du simulateur'; }
        else if (ov.isRate != null) { ratePct = ov.isRate; rateStatus = 'override'; rateDetail = `Règle saisie à partir de ${fy.openYear}`; }
        else {
          const res = resolveIsRate(taxable / 100, fy.openYear, tax.isCategory);
          if (res) { ratePct = res.ratePct; rateStatus = res.status; rateDetail = res.detail; }
          else {
            rateStatus = 'not_covered';
            rateDetail = 'Aucune règle IS vérifiée avant 2023';
            warnings.push({ code: 'is_rule_missing', severity: 'error', month: m, message: `Exercice ${fy.label} : aucun taux d’IS vérifié avant 2023. Saisissez une règle fiscale de substitution.` });
          }
        }
        computed = applyRate(taxable, ratePct);
      } else {
        ratePct = 0;
        rateStatus = 'verified_official';
        rateDetail = 'Barème IR annuel (art. 73-I)';
        computed = toCents(irAnnual(taxable / 100));
      }
      let reduction = 0;
      let cmExemptByIncentive = false;
      for (const ex of tax.exemptions) {
        if (fi + 1 >= ex.fromFiscalYearIndex && fi + 1 <= ex.toFiscalYearIndex) {
          reduction += applyRate(computed - reduction, ex.reductionPct);
          if (ex.minimumContributionExempt) cmExemptByIncentive = true;
        }
      }
      const afterExemption = computed - reduction;
      const cmRuleRate = minimumContributionRatePct(fy.openYear);
      const cmRate = tax.minimumContributionRateOverridePct ?? ov.cmRate ?? cmRuleRate.ratePct;
      const floor = toCents(isRegime ? MINIMUM_CONTRIBUTION_FLOOR_IS : MINIMUM_CONTRIBUTION_FLOOR_IR);
      const cm = Math.max(applyRate(cmBaseFy, cmRate), floor);
      const exemptWindow = isRegime
        ? fy.startOffset < tax.activityStartMonth + 36 && fy.startOffset < incorporationOffset + 60
        : fi < 3;
      const cmExempt = cmExemptByIncentive || (tax.applyMinimumContributionExemption && exemptWindow);
      const due = cmExempt ? afterExemption : Math.max(afterExemption, cm);
      isExpense[m] += due;
      isDueByFy[fi] = due;
      isYears.push({
        fiscalYearIndex: fi, label: fy.label, openYear: fy.openYear, months: fy.months, partial: fy.partial,
        accountingResult: ebtFy, nonDeductible: nonDed, taxableBeforeLosses: before, lossesUsed: used, lossesCarried: carried,
        taxable, ratePct, rateStatus, rateDetail, computedTax: computed, exemptionReduction: reduction,
        minimumContributionBase: cmBaseFy, minimumContributionRatePct: cmRate, minimumContribution: cm, minimumContributionExempt: cmExempt,
        minimumContributionApplied: !cmExempt && cm > afterExemption, taxDue: due, regime: tax.regime,
      });
      if (fy.openYear > 2026 && isRegime && levers.isRateOverridePct == null && ov.isRate == null && !warnings.some((w) => w.code === 'is_assumed_unchanged')) {
        warnings.push({ code: 'is_assumed_unchanged', severity: 'info', message: 'Exercices postérieurs à 2026 : taux d’IS et de cotisation minimale 2026 supposés inchangés (aucune loi de finances postérieure intégrée).' });
      }

      // Balance of the year, due within the declaration deadline (3 months after the close).
      const balanceAt = m + 3;
      const balance = due - acomptesPaidByFy[fi];
      if (balance > 0) {
        if (balanceAt < N) { isPay[balanceAt] += balance; taxPayments.push({ month: balanceAt, tax: isRegime ? 'IS' : 'IR', label: `Solde ${isRegime ? 'IS' : 'IR'} ${fy.label}`, amount: balance }); }
      } else if (balance < 0) {
        isCredit += -balance;
      }
      // Instalments of the next fiscal year (IS only), on the annualised tax of this year.
      const nextFy = cal.fiscalYears[fi + 1];
      if (isRegime && nextFy) {
        const reference = fy.months < 12 ? roundHalfAwayFromZero((due * 12) / fy.months) : due;
        const a = applyRate(reference, 25);
        for (const q of [2, 5, 8, 11]) {
          const at = nextFy.startOffset + q;
          if (at > nextFy.lastMonth || at >= N || at < nextFy.firstMonth) continue;
          const offset = Math.min(isCredit, a);
          isCredit -= offset;
          const pay = a - offset;
          acomptesPaidByFy[fi + 1] += a;
          if (pay > 0) { isPay[at] += pay; taxPayments.push({ month: at, tax: 'IS', label: `Acompte IS ${nextFy.label}`, amount: pay }); }
        }
      }
      ebtFy = 0;
      cmBaseFy = 0;
    }

    M.incomeTax[m] = isExpense[m];
    M.netIncome[m] = M.ebt[m] - M.incomeTax[m];
    netIncomeByFy[fi] += M.netIncome[m];

    // Dividends on the previous fiscal year's profit.
    if (fi >= 1 && m === Math.min(fy.lastMonth, Math.max(fy.firstMonth, fy.startOffset + model.financing.dividends.paymentMonthOfFiscalYear - 1))) {
      const prevIndex = fi - 1;
      if (prevIndex + 1 >= model.financing.dividends.fromFiscalYearIndex && model.financing.dividends.payoutPct > 0) {
        const base = Math.max(0, netIncomeByFy[prevIndex]);
        const distributable = Math.max(0, reserves);
        const gross = Math.min(applyRate(base, model.financing.dividends.payoutPct), distributable);
        if (gross > 0) {
          const wh = applyRate(gross, model.financing.dividends.withholdingRatePct);
          divGross[m] += gross;
          divWh[m] += wh;
          divPay[m] += gross - wh;
          if (wh > 0) taxPayments.push({ month: m, tax: 'RAS', label: `Retenue sur dividendes ${cal.fiscalYears[prevIndex].label} (pour le compte des associés)`, amount: wh });
        }
      }
    }

    // VAT: accumulate, settle at period end, pay the following month.
    periodCollected += vatCollectedDue[m];
    periodDeductible += vatDeductible[m];
    if (m === 0 && vatOpeningDue > 0) {
      vatPay[0] += vatOpeningDue;
      taxPayments.push({ month: 0, tax: 'TVA', label: 'TVA due à l’ouverture', amount: vatOpeningDue });
      vatOpeningDue = 0;
    }
    if (periodEnd[m] && vatOn) {
      const netV = periodCollected - periodDeductible - vatCreditCarry;
      const payable = Math.max(0, netV);
      const carry = Math.max(0, -netV);
      const payAt = m + 1 < N ? m + 1 : null;
      vatPeriods.push({
        label: periodLabel[m], firstMonth: periodStart, lastMonth: m, collected: periodCollected, deductible: periodDeductible,
        creditBroughtForward: vatCreditCarry, net: netV, payable, creditCarriedForward: carry, paymentMonth: payable > 0 ? payAt : null,
      });
      if (payable > 0 && payAt != null) { vatPay[payAt] += payable; taxPayments.push({ month: payAt, tax: 'TVA', label: `TVA ${periodLabel[m]}`, amount: payable }); }
      vatCreditCarry = carry;
      periodCollected = 0;
      periodDeductible = 0;
      periodStart = m + 1;
    }

    // Cash.
    M.cashInSales[m] = collections[m];
    M.cashOutSuppliers[m] = supplierPaid[m];
    M.cashOutOpex[m] = opexPaid[m];
    M.cashOutNetSalaries[m] = M.netSalaries[m];
    M.cashOutSocial[m] = socialPay[m];
    M.cashOutIrSalarial[m] = irPay[m];
    M.cashOutVat[m] = vatPay[m];
    M.cashOutIncomeTax[m] = isPay[m];
    M.cashOutDividends[m] = divPay[m];
    M.cashOutDividendWithholding[m] = divWh[m];
    M.dividendsGross[m] = divGross[m];
    const inflow = M.cashInSales[m] + M.cashInEquity[m] + M.cashInLoans[m] + M.cashInGrants[m];
    const outflow = M.cashOutSuppliers[m] + M.cashOutOpex[m] + M.cashOutNetSalaries[m] + M.cashOutSocial[m] + M.cashOutIrSalarial[m]
      + M.cashOutVat[m] + M.cashOutIncomeTax[m] + M.cashOutLocalTaxes[m] + M.cashOutCapex[m] + M.cashOutPrincipal[m]
      + M.cashOutInterest[m] + M.cashOutDividends[m] + M.cashOutDividendWithholding[m];
    M.netCashFlow[m] = inflow - outflow;
    cash += M.netCashFlow[m];
    M.cash[m] = cash;

    // Balances.
    receivables += salesTtc[m] - collections[m] - badDebtTtc[m];
    payables += payablesInvoiced[m] - supplierPaid[m] - opexPaid[m];
    vatDedPending += vatDedInvoiced[m] - supplierVatPaid[m] - opexVatPaid[m];
    if (vatOn && tax.vatRegime === 'encaissement') vatCollPending += M.vatInvoicedSales[m] - vatOnCollections[m] - badDebtVat[m];
    vatNet += vatCollectedDue[m] - vatDeductible[m] - vatPay[m];
    isNet += M.incomeTax[m] - isPay[m];
    social += socialAccrued[m] + irAccrued[m] - socialPay[m] - irPay[m];
    localNet += M.localTaxes[m] - M.cashOutLocalTaxes[m];
    fixedGross += M.capexCost[m];
    accDep += M.depreciation[m];
    capital += M.cashInEquity[m];
    reserves += M.netIncome[m] - divGross[m];
    grantsNet += grantsReceived[m] - M.grantRelease[m];

    M.fixedAssetsGross[m] = fixedGross;
    M.accumulatedDepreciation[m] = accDep;
    M.fixedAssetsNet[m] = fixedGross - accDep;
    M.receivables[m] = receivables;
    M.vatDeductiblePending[m] = vatDedPending;
    M.vatCreditAsset[m] = vatNet < 0 ? -vatNet : 0;
    M.vatPayable[m] = vatNet > 0 ? vatNet : 0;
    M.incomeTaxReceivable[m] = isNet < 0 ? -isNet : 0;
    M.incomeTaxPayable[m] = isNet > 0 ? isNet : 0;
    M.localTaxPrepaid[m] = localNet < 0 ? -localNet : 0;
    M.localTaxPayable[m] = localNet > 0 ? localNet : 0;
    M.cashAsset[m] = cash > 0 ? cash : 0;
    M.overdraft[m] = cash < 0 ? -cash : 0;
    M.payables[m] = payables;
    M.vatCollectedPending[m] = vatCollPending;
    M.socialPayable[m] = social;
    M.capital[m] = capital;
    M.reserves[m] = reserves;
    M.grantsNet[m] = grantsNet;
    M.equity[m] = capital + reserves + grantsNet;
    M.totalAssets[m] = M.fixedAssetsNet[m] + M.inventory[m] + M.receivables[m] + M.vatDeductiblePending[m] + M.vatCreditAsset[m]
      + M.incomeTaxReceivable[m] + M.localTaxPrepaid[m] + M.cashAsset[m];
    M.totalLiabilitiesAndEquity[m] = M.equity[m] + M.loans[m] + M.payables[m] + M.vatCollectedPending[m] + M.vatPayable[m]
      + M.incomeTaxPayable[m] + M.socialPayable[m] + M.localTaxPayable[m] + M.overdraft[m];
    M.balanceDiff[m] = M.totalAssets[m] - M.totalLiabilitiesAndEquity[m];
    M.bfr[m] = M.inventory[m] + M.receivables[m] + M.vatDeductiblePending[m] - M.payables[m] - M.vatCollectedPending[m]
      - vatNet - isNet - social - localNet;
    M.netDebt[m] = M.loans[m] + M.overdraft[m] - M.cashAsset[m];
    M.subscribers[m] = Math.round(subscribersTotal[m]);
  }

  // ── Cash-flow statement (indirect), FCF, CAF, checks ──
  let cfMax = 0;
  let pfMax = 0;
  let pnlMax = 0;
  let cumBeforeFinancing = ob ? toCents(ob.cash) : 0;
  // Unlevered FCFF removes the tax saving on financial charges at the year's statutory rate, whether the saving is
  // immediate or deferred through loss carry-forwards; otherwise a higher interest rate could raise project NPV.
  const interestShieldRate = new Array<number>(N).fill(0);
  for (const y of isYears) {
    const fy = cal.fiscalYears[y.fiscalYearIndex];
    const incentiveShare = y.computedTax > 0 ? Math.max(0, y.computedTax - y.exemptionReduction) / y.computedTax : 1;
    const isPct = y.taxable > 0 || y.rateStatus === 'override' ? y.ratePct : (resolveIsRate(0.01, y.openYear, tax.isCategory)?.ratePct ?? 0);
    const statutory = y.regime === 'is' ? isPct / 100 : (y.taxable > 0 ? y.computedTax / y.taxable : 0);
    for (let m = fy.firstMonth; m < Math.min(N, fy.firstMonth + fy.months); m += 1) interestShieldRate[m] = statutory * incentiveShare;
  }
  for (let m = 0; m < N; m += 1) {
    const prev = (k: LineKey) => (m === 0 ? openingValue(k) : M[k][m - 1]);
    const d = (k: LineKey) => M[k][m] - prev(k);
    const dVatNet = (M.vatPayable[m] - M.vatCreditAsset[m]) - (prev('vatPayable') - prev('vatCreditAsset'));
    const dIsNet = (M.incomeTaxPayable[m] - M.incomeTaxReceivable[m]) - (prev('incomeTaxPayable') - prev('incomeTaxReceivable'));
    const dLocalNet = (M.localTaxPayable[m] - M.localTaxPrepaid[m]) - (prev('localTaxPayable') - prev('localTaxPrepaid'));
    M.caf[m] = M.netIncome[m] + M.depreciation[m] - M.grantRelease[m];
    M.cfo[m] = M.caf[m] + M.capitalizedInterest[m] - d('inventory') - d('receivables') - d('vatDeductiblePending')
      + d('payables') + d('vatCollectedPending') + dVatNet + dIsNet + d('socialPayable') + dLocalNet;
    M.cfi[m] = -M.capexCost[m];
    M.cff[m] = M.cashInEquity[m] + M.cashInLoans[m] + M.cashInInvestmentGrants[m] - M.cashOutPrincipal[m] - M.dividendsGross[m];
    const dCash = M.cash[m] - (m === 0 ? (ob ? toCents(ob.cash) : 0) : M.cash[m - 1]);
    cfMax = Math.max(cfMax, Math.abs(M.cfo[m] + M.cfi[m] + M.cff[m] - dCash));
    // Plan de financement: resources − uses = change in cash.
    const resources = M.caf[m] + M.cashInEquity[m] + M.cashInLoans[m] + M.capitalizedInterest[m] + M.cashInInvestmentGrants[m];
    const uses = M.capexCost[m] + (M.bfr[m] - (m === 0 ? openingValue('bfr') : M.bfr[m - 1])) + M.cashOutPrincipal[m] + M.dividendsGross[m];
    pfMax = Math.max(pfMax, Math.abs(resources - uses - dCash));
    const pnl = M.revenue[m] + M.operatingGrants[m] - M.cogs[m] - M.externalCharges[m] - M.localTaxes[m] - M.salaries[m]
      - M.employerCharges[m] - M.depreciation[m] - M.financialCharges[m] + M.grantRelease[m] - M.badDebts[m] - M.incomeTax[m];
    pnlMax = Math.max(pnlMax, Math.abs(pnl - M.netIncome[m]));
    // Income tax is taken when expensed (not on the instalment schedule, which depends on the previous year's levered tax).
    M.fcff[m] = M.cfo[m] - dIsNet + M.cashOutInterest[m] - roundHalfAwayFromZero(M.financialCharges[m] * interestShieldRate[m]) + M.cfi[m];
    M.fcfe[m] = dCash - M.cashInEquity[m] + M.dividendsGross[m];
    cumBeforeFinancing += M.cfo[m] + M.cashOutInterest[m] + M.cfi[m];
    M.cashBeforeFinancing[m] = cumBeforeFinancing;
  }

  function openingValue(k: LineKey): Cents {
    if (!ob) return 0;
    switch (k) {
      case 'inventory': return toCents(ob.inventory);
      case 'receivables': return toCents(ob.receivables);
      case 'payables': return toCents(ob.payables);
      case 'vatPayable': return Math.max(0, toCents(ob.vatPayable) - toCents(ob.vatCredit));
      case 'vatCreditAsset': return Math.max(0, toCents(ob.vatCredit) - toCents(ob.vatPayable));
      case 'incomeTaxPayable': return toCents(ob.isPayable);
      case 'socialPayable': return toCents(ob.socialPayable);
      case 'bfr': return toCents(ob.inventory) + toCents(ob.receivables) - toCents(ob.payables) - (toCents(ob.vatPayable) - toCents(ob.vatCredit)) - toCents(ob.isPayable) - toCents(ob.socialPayable);
      default: return 0;
    }
  }

  const bsMax = M.balanceDiff.reduce((s, v) => Math.max(s, Math.abs(v)), 0);
  const checks: ChecksResult = {
    balanceSheetMaxAbsDiff: bsMax, cashFlowMaxAbsDiff: cfMax, planFinancementMaxAbsDiff: pfMax, pnlMaxAbsDiff: pnlMax,
    ok: bsMax === 0 && cfMax === 0 && pfMax === 0 && pnlMax === 0,
  };
  if (!checks.ok) {
    warnings.push({ code: 'reconciliation_failed', severity: 'error', message: `Contrôles de cohérence en échec (bilan ${bsMax}, flux ${cfMax}, plan de financement ${pfMax}, CPC ${pnlMax} centimes).` });
  }

  // Payroll tax calendar.
  for (let m = 0; m < N; m += 1) {
    if (socialPay[m] > 0) taxPayments.push({ month: m, tax: 'CNSS', label: 'CNSS, AMO et taxe de formation professionnelle', amount: socialPay[m] });
    if (irPay[m] > 0) taxPayments.push({ month: m, tax: 'IR_SAL', label: 'IR retenu sur salaires', amount: irPay[m] });
    if (M.cashOutLocalTaxes[m] > 0) taxPayments.push({ month: m, tax: 'LOCAL', label: 'Impôts et taxes locaux', amount: M.cashOutLocalTaxes[m] });
  }
  taxPayments.sort((a, b) => a.month - b.month || a.tax.localeCompare(b.tax));

  // Cash alerts.
  const minCash = toCents(wc.minimumCash);
  const firstShort = M.cash.findIndex((c) => c < minCash);
  if (firstShort >= 0) {
    warnings.push({ code: 'cash_below_minimum', severity: 'warning', month: firstShort, message: `Trésorerie inférieure au minimum souhaité à partir de ${cal.labels[firstShort]}.` });
  }
  const firstNegEquity = M.equity.findIndex((e) => e < 0);
  if (firstNegEquity >= 0) {
    warnings.push({ code: 'negative_equity', severity: 'warning', month: firstNegEquity, message: `Capitaux propres négatifs à partir de ${cal.labels[firstNegEquity]}.` });
  }
  if (tax.regime === 'auto_entrepreneur' && tax.autoEntrepreneurRatePct === 0) {
    warnings.push({ code: 'ae_rate_missing', severity: 'warning', message: 'Régime auto-entrepreneur : taux non saisi, l’impôt projeté est nul.' });
  }

  return {
    engineVersion: ENGINE_VERSION, rulesVersion: TAX_RULES_VERSION, scenarioId: activeScenario, calendar: cal, monthly: M,
    products, loans, assets, staff, expenses, isYears, vatPeriods, taxPayments, checks, warnings,
  };
}

/** Rounds a MAD amount to centimes for display-side computations that need it. */
export function madToCents(v: number): Cents {
  return toCents(v);
}

export { mulCents };
