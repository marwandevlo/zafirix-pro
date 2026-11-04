import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStudy } from '../../app/lib/business-studio/engine';
import {
  emptyModel, newExpense, newInvestment, newLoan, newProduct, newStaff, validateStudyModel, type StudyModel,
} from '../../app/lib/business-studio/model';

/** Mulberry32: deterministic PRNG so failures are reproducible from the seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomModel(seed: number): StudyModel {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
  const years = pick([1, 2, 3, 5, 7, 10, 15, 20, 30]);
  const startYear = pick([2023, 2024, 2025, 2026, 2027]);
  const m = emptyModel({ startMonth: `${startYear}-${String(int(1, 12)).padStart(2, '0')}`, years });
  const N = years * 12;
  m.horizon.fiscalYearStartMonth = pick([1, 1, 1, 4, 7, 10]);
  m.general.inflationPct = between(0, 6);
  m.tax.regime = pick(['is', 'is', 'is', 'ir_professional', 'auto_entrepreneur'] as const);
  m.tax.vatSubject = r() > 0.15;
  m.tax.vatRegime = pick(['encaissement', 'debit'] as const);
  m.tax.vatPeriodicity = pick(['auto', 'monthly', 'quarterly'] as const);
  m.tax.isCategory = pick(['standard', 'industrial', 'zai_cfc', 'former_20pct_sector', 'credit_insurance'] as const);
  m.tax.applyMinimumContributionExemption = r() > 0.5;
  m.tax.autoEntrepreneurRatePct = pick([0.5, 1, 2]);
  const vatRates = startYear >= 2026 ? [0, 10, 20] : [0, 10, 20, 14];
  m.products = Array.from({ length: int(0, 4) }, () => newProduct({
    kind: pick(['one_time', 'one_time', 'subscription'] as const),
    unitPrice: Math.round(between(1, 5000) * 100) / 100,
    priceGrowthPct: between(-5, 10),
    volumeMonth1: int(0, 2000),
    volumeGrowthPct: [between(-30, 80), between(-10, 30)],
    seasonality: Array.from({ length: 12 }, () => between(0, 2)),
    discountPct: between(0, 20), returnsPct: between(0, 10),
    capacityPerMonth: r() > 0.6 ? int(10, 3000) : null, utilizationPct: between(30, 100),
    unitCost: Math.round(between(0, 3000) * 100) / 100, unitCostGrowthPct: between(-3, 8),
    vatRatePct: pick(vatRates), purchaseVatRatePct: pick(vatRates),
    churnPctMonthly: between(0, 15), cacPerCustomer: between(0, 500),
    launchMonth: int(0, Math.max(0, N - 1)),
  }));
  m.expenses = Array.from({ length: int(0, 5) }, () => newExpense({
    behavior: pick(['fixed', 'fixed', 'variable_revenue_pct'] as const),
    amountMonthly: Math.round(between(0, 60000) * 100) / 100, pctOfRevenue: between(0, 15),
    startMonth: int(0, N - 1), growthPct: between(-5, 10), indexedOnInflation: r() > 0.5,
    vatRatePct: pick(vatRates), vatDeductible: r() > 0.2, paymentDelayDays: r() > 0.5 ? int(0, 120) : null,
  }));
  m.staff = Array.from({ length: int(0, 4) }, () => newStaff({
    headcount: int(1, 12), grossMonthly: Math.round(between(3000, 60000)), startMonth: int(0, N - 1),
    annualRaisePct: between(0, 8), dependants: int(0, 6),
  }));
  m.investments = Array.from({ length: int(0, 5) }, () => newInvestment({
    kind: pick(['tangible', 'tangible', 'intangible', 'land', 'deposit', 'goodwill'] as const),
    amountHT: Math.round(between(1000, 3_000_000) * 100) / 100, vatRatePct: pick(vatRates), vatRecoverable: r() > 0.2,
    month: int(0, N - 1), usefulLifeYears: int(1, 25), method: pick(['linear', 'declining'] as const),
    decliningCoefficient: pick([1.5, 2, 3]),
  }));
  m.financing.equity = Array.from({ length: int(0, 3) }, (_, i) => ({ id: `q${i}`, name: 'Apport', amount: Math.round(between(0, 2_000_000)), month: int(0, N - 1) }));
  m.financing.loans = Array.from({ length: int(0, 3) }, () => newLoan({
    kind: pick(['bank', 'shareholder'] as const), principal: Math.round(between(1000, 3_000_000)), month: int(0, N - 1),
    annualRatePct: between(0, 14), termMonths: int(1, 180), graceMonths: int(0, 24),
    graceType: pick(['interest_only', 'capitalized'] as const), method: pick(['annuity', 'constant_principal', 'bullet'] as const),
    feesPct: between(0, 3),
  }));
  for (const l of m.financing.loans) l.graceMonths = Math.min(l.graceMonths, l.termMonths - 1);
  m.financing.grants = Array.from({ length: int(0, 2) }, (_, i) => ({
    id: `g${i}`, name: 'Subvention', kind: pick(['investment', 'operating'] as const), amount: Math.round(between(0, 500000)),
    month: int(0, N - 1), amortizationYears: int(1, 15),
  }));
  m.financing.leases = Array.from({ length: int(0, 2) }, (_, i) => ({
    id: `lz${i}`, name: 'CB', monthlyRentHT: Math.round(between(500, 20000)), vatRatePct: pick(vatRates), startMonth: int(0, N - 1),
    termMonths: int(6, 72), purchaseOptionHT: r() > 0.5 ? Math.round(between(0, 50000)) : 0, optionAssetLifeYears: int(1, 10),
  }));
  m.financing.overdraftRatePct = between(0, 15);
  m.financing.dividends = { payoutPct: between(0, 100), fromFiscalYearIndex: int(1, 4), paymentMonthOfFiscalYear: int(1, 12), withholdingRatePct: pick([0, 10, 12.5, 15]) };
  m.workingCapital = {
    cashSalesPct: between(0, 100), dsoDays: int(0, 180), dpoDays: int(0, 180), inventoryDays: int(0, 180),
    badDebtPct: between(0, 10), minimumCash: int(0, 100000),
  };
  if (r() > 0.6) {
    const cash = int(0, 500000), rec = int(0, 300000), inv = int(0, 200000), gross = int(0, 1_000_000);
    const acc = Math.floor(gross * r());
    const debt = int(0, 400000), pay = int(0, 200000), soc = int(0, 30000), isp = int(0, 20000);
    const vatC = int(0, 20000), vatP = int(0, 20000);
    const assets = cash + rec + inv + vatC + gross - acc;
    const liab = pay + soc + isp + vatP + debt;
    m.projectType = 'existing';
    m.openingBalance = {
      enabled: true, cash, receivables: rec, inventory: inv, vatCredit: vatC, fixedAssetsGross: gross, accumulatedDepreciation: acc,
      remainingLifeYears: int(1, 15), payables: pay, vatPayable: vatP, socialPayable: soc, isPayable: isp,
      debtBalance: debt, debtAnnualRatePct: between(0, 10), debtRemainingMonths: debt > 0 ? int(1, 120) : 0,
      capital: Math.max(0, assets - liab), reserves: Math.min(0, assets - liab), priorYearIsDue: isp,
    };
  }
  if (r() > 0.7) {
    m.tax.overrides = [{ id: 'o', fromFiscalYear: startYear, isRatePct: between(0, 40), minimumContributionRatePct: between(0, 1), note: 'fuzz' }];
  }
  return m;
}

test('400 random studies reconcile exactly in every scenario', () => {
  let ran = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    const v = validateStudyModel(randomModel(seed));
    const errors = v.issues.filter((i) => i.severity === 'error');
    assert.deepEqual(errors, [], `seed ${seed}: generator produced an invalid model`);
    for (const scenario of ['base', 'optimistic', 'pessimistic']) {
      const res = computeStudy(v.model, scenario);
      const c = res.checks;
      assert.ok(c.ok, `seed ${seed} ${scenario}: bs ${c.balanceSheetMaxAbsDiff} cf ${c.cashFlowMaxAbsDiff} pf ${c.planFinancementMaxAbsDiff} pnl ${c.pnlMaxAbsDiff}`);
      for (const [k, s] of Object.entries(res.monthly)) {
        for (const x of s) assert.ok(Number.isSafeInteger(x), `seed ${seed} ${scenario}: ${k} = ${x}`);
      }
      for (const l of res.loans) {
        const last = l.rows.at(-1);
        if (last && last.month < res.calendar.months) assert.ok(last.closing === 0, `seed ${seed}: loan ${l.id} not repaid`);
      }
      ran += 1;
    }
  }
  assert.equal(ran, 1200);
});
