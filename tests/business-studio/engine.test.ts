import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCalendar, computeStudy, type StudyResult } from '../../app/lib/business-studio/engine';
import { emptyModel, newInvestment, newLoan, newProduct, newExpense, validateStudyModel } from '../../app/lib/business-studio/model';
import { richModel } from './fixtures';

const total = (s: number[]) => s.reduce((a, b) => a + b, 0);

function assertReconciled(r: StudyResult, label: string) {
  assert.equal(r.checks.balanceSheetMaxAbsDiff, 0, `${label}: balance sheet`);
  assert.equal(r.checks.cashFlowMaxAbsDiff, 0, `${label}: cash flow`);
  assert.equal(r.checks.planFinancementMaxAbsDiff, 0, `${label}: plan de financement`);
  assert.equal(r.checks.pnlMaxAbsDiff, 0, `${label}: P&L`);
  assert.equal(r.checks.ok, true, label);
  for (const [k, s] of Object.entries(r.monthly)) {
    for (const v of s) assert.ok(Number.isSafeInteger(v), `${label}: ${k} must be integer centimes, got ${v}`);
  }
}

test('calendar: fiscal years, partial years, quarters', () => {
  const c = buildCalendar('2026-04', 2, 1);
  assert.equal(c.months, 24);
  assert.deepEqual(c.fiscalYears.map((f) => [f.openYear, f.months, f.partial]), [[2026, 9, true], [2027, 12, false], [2028, 3, true]]);
  const c2 = buildCalendar('2026-07', 1, 7);
  assert.equal(c2.fiscalYears.length, 1);
  assert.equal(c2.fiscalYears[0].months, 12);
  assert.equal(c2.quarterLabels.length, 4);
});

test('rich model reconciles exactly for every horizon 1..30 years', () => {
  for (const years of [1, 2, 3, 5, 7, 10, 15, 20, 30]) {
    const m = richModel(years);
    assert.equal(validateStudyModel(m).ok, true, `${years}y validates`);
    const r = computeStudy(m);
    assert.equal(r.calendar.months, years * 12);
    assertReconciled(r, `${years}y`);
  }
});

test('items dated after a shortened horizon stay valid and are ignored', () => {
  const m = richModel(5);
  m.horizon.years = 1;
  const v = validateStudyModel(m);
  assert.equal(v.ok, true, JSON.stringify(v.issues.slice(0, 3)));
  const r = computeStudy(v.model);
  assertReconciled(r, 'shortened');
  for (const s of Object.values(r.monthly)) assert.equal(s.length, 12);
  assert.equal(total(r.monthly.cashInLoans), r.loans.filter((l) => l.disbursementMonth >= 0 && l.disbursementMonth < 12).reduce((a, l) => a + l.principal, 0));
});

test('all default scenarios reconcile and differ', () => {
  const m = richModel(5);
  const base = computeStudy(m, 'base');
  const opt = computeStudy(m, 'optimistic');
  const pes = computeStudy(m, 'pessimistic');
  for (const r of [base, opt, pes]) assertReconciled(r, r.scenarioId);
  assert.ok(total(opt.monthly.revenue) > total(base.monthly.revenue));
  assert.ok(total(pes.monthly.revenue) < total(base.monthly.revenue));
});

test('VAT is never an income-statement expense when deductible', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 1 });
  m.products = [newProduct({ unitPrice: 100, volumeMonth1: 10, unitCost: 0 })];
  m.expenses = [newExpense({ amountMonthly: 1000, vatRatePct: 20, indexedOnInflation: false })];
  m.financing.equity = [{ id: 'q', name: 'c', amount: 50000, month: 0 }];
  const r = computeStudy(m);
  assertReconciled(r, 'vat');
  assert.equal(total(r.monthly.revenue), 12 * 1000 * 100);
  assert.equal(total(r.monthly.externalCharges), 12 * 1000 * 100);
  assert.equal(total(r.monthly.vatCollectedDue), 12 * 200 * 100);
});

test('non-deductible VAT is added to the charge, not double counted', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 1 });
  m.expenses = [newExpense({ amountMonthly: 1000, vatRatePct: 20, vatDeductible: false, indexedOnInflation: false })];
  m.financing.equity = [{ id: 'q', name: 'c', amount: 50000, month: 0 }];
  const r = computeStudy(m);
  assertReconciled(r, 'nd-vat');
  assert.equal(total(r.monthly.externalCharges), 12 * 1200 * 100);
  assert.equal(total(r.monthly.vatDeductible), 0);
});

test('zero revenue: CM floor 3000 MAD applies after the creation exemption window', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 5 });
  m.financing.equity = [{ id: 'q', name: 'c', amount: 100000, month: 0 }];
  m.tax.applyMinimumContributionExemption = true;
  const r = computeStudy(m);
  assertReconciled(r, 'zero');
  assert.deepEqual(r.isYears.map((y) => y.taxDue), [0, 0, 0, 300000, 300000]);
  assert.ok(r.isYears.slice(0, 3).every((y) => y.minimumContributionExempt));
});

test('losses are carried forward and offset later profits', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 3 });
  m.tax.applyMinimumContributionExemption = false;
  m.financing.equity = [{ id: 'q', name: 'c', amount: 500000, month: 0 }];
  m.expenses = [newExpense({ amountMonthly: 50000, endMonth: 11, indexedOnInflation: false, vatRatePct: 0 })];
  m.products = [newProduct({ unitPrice: 100, volumeMonth1: 1000, unitCost: 0, launchMonth: 12, vatRatePct: 20 })];
  const r = computeStudy(m);
  assertReconciled(r, 'losses');
  const [y1, y2] = r.isYears;
  assert.equal(y1.taxableBeforeLosses, -600000 * 100);
  assert.equal(y2.lossesUsed, 600000 * 100);
  assert.equal(y2.taxable, (1200000 - 600000) * 100);
  assert.equal(y2.ratePct, 20);
  assert.equal(y2.computedTax, 120000 * 100);
});

test('IS 2025 transitional rate vs 2026 rate', () => {
  const mk = (start: string) => {
    const m = emptyModel({ startMonth: start, years: 1 });
    m.tax.applyMinimumContributionExemption = false;
    m.financing.equity = [{ id: 'q', name: 'c', amount: 10000, month: 0 }];
    m.products = [newProduct({ unitPrice: 1000, volumeMonth1: 200, unitCost: 0 })];
    return computeStudy(m);
  };
  const r25 = mk('2025-01');
  const r26 = mk('2026-01');
  assertReconciled(r25, '2025');
  assertReconciled(r26, '2026');
  // 2.4 M MAD profit: 2025 standard band (> 1 M, < 100 M) is 22.75 %; 2026 is 20 %.
  assert.equal(r25.isYears[0].ratePct, 22.75);
  assert.equal(r26.isYears[0].ratePct, 20);
  assert.equal(r26.isYears[0].computedTax, 480000 * 100);
});

test('IS rate before 2023 is not invented', () => {
  const m = emptyModel({ startMonth: '2022-01', years: 1 });
  m.tax.applyMinimumContributionExemption = false;
  m.products = [newProduct({ unitPrice: 1000, volumeMonth1: 10, unitCost: 0 })];
  m.financing.equity = [{ id: 'q', name: 'c', amount: 10000, month: 0 }];
  const r = computeStudy(m);
  assertReconciled(r, '2022');
  assert.ok(r.warnings.some((w) => w.code.startsWith('is_rule')), 'expects a missing-rule warning');
});

test('VAT credit is carried forward, never refunded', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 2 });
  m.financing.equity = [{ id: 'q', name: 'c', amount: 2000000, month: 0 }];
  m.investments = [newInvestment({ amountHT: 1000000, usefulLifeYears: 10 })];
  m.products = [newProduct({ unitPrice: 100, volumeMonth1: 500, unitCost: 0 })];
  const r = computeStudy(m);
  assertReconciled(r, 'vat-credit');
  assert.ok(r.vatPeriods[0].creditCarriedForward > 0);
  assert.equal(r.vatPeriods[0].payable, 0);
  assert.ok(r.monthly.vatCreditAsset[0] > 0);
  // The credit is consumed by later collected VAT, so total VAT paid ≤ collected − deductible.
  const paid = total(r.monthly.cashOutVat);
  assert.ok(paid <= total(r.monthly.vatCollectedDue) - total(r.monthly.vatDeductible) + r.monthly.vatCreditAsset[r.calendar.months - 1]);
});

test('loan with grace period: interest only, then full repayment', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 8 });
  m.financing.loans = [newLoan({ id: 'L', principal: 120000, annualRatePct: 6, termMonths: 60, graceMonths: 12 })];
  const r = computeStudy(m);
  assertReconciled(r, 'loan');
  const L = r.loans.find((l) => l.id === 'L')!;
  assert.equal(L.rows.length, 60);
  assert.ok(L.rows.slice(0, 12).every((x) => x.principal === 0 && x.interest === 60000));
  assert.equal(total(L.rows.map((x) => x.principal)), 120000 * 100);
  assert.equal(L.rows[59].closing, 0);
  assert.equal(r.monthly.loans[r.calendar.months - 1], 0);
});

test('capitalized grace increases the principal and is not a cash interest', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 5 });
  m.financing.loans = [newLoan({ id: 'L', principal: 100000, annualRatePct: 12, termMonths: 36, graceMonths: 6, graceType: 'capitalized', method: 'constant_principal' })];
  const r = computeStudy(m);
  assertReconciled(r, 'capitalized');
  const L = r.loans[0];
  const cap = total(L.rows.map((x) => x.capitalized));
  assert.ok(cap > 0);
  assert.equal(total(L.rows.map((x) => x.principal)), 100000 * 100 + cap);
  assert.equal(total(r.monthly.capitalizedInterest), cap);
});

test('mid-year investment: depreciation starts in the acquisition month (prorata temporis)', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 6 });
  m.financing.equity = [{ id: 'q', name: 'c', amount: 200000, month: 0 }];
  m.investments = [newInvestment({ id: 'A', amountHT: 120000, usefulLifeYears: 5, month: 6 })];
  const r = computeStudy(m);
  assertReconciled(r, 'mid-year');
  const a = r.assets.find((x) => x.id === 'A')!;
  assert.equal(a.depreciation.slice(0, 6).reduce((s, v) => s + v, 0), 0);
  assert.equal(total(a.depreciation), 120000 * 100);
  assert.equal(a.depreciation[6], 2000 * 100);
});

test('declining balance uses the legal coefficient and fully depreciates', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 7 });
  m.financing.equity = [{ id: 'q', name: 'c', amount: 200000, month: 0 }];
  m.investments = [newInvestment({ id: 'D', amountHT: 100000, usefulLifeYears: 5, method: 'declining', decliningCoefficient: 2 })];
  const r = computeStudy(m);
  assertReconciled(r, 'declining');
  const d = r.assets[0];
  assert.equal(total(d.depreciation), 100000 * 100);
  // CGI art. 10: coefficient 2 for 5–6 years, so no warning; 3 at 5 years is flagged.
  assert.ok(!r.warnings.some((w) => w.code === 'declining_coefficient'));
  m.investments[0].decliningCoefficient = 3;
  const r3 = computeStudy(m);
  assertReconciled(r3, 'declining-3');
  assert.ok(r3.warnings.some((w) => w.code === 'declining_coefficient'));
  // First-year depreciation at 40 % (2 / 5 years) is twice the linear charge.
  assert.equal(total(d.depreciation.slice(0, 12)), 40000 * 100);
});

test('high debt and negative cash raise warnings and use overdraft', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 3 });
  m.financing.overdraftRatePct = 12;
  m.expenses = [newExpense({ amountMonthly: 30000, vatRatePct: 0 })];
  const r = computeStudy(m);
  assertReconciled(r, 'overdraft');
  assert.ok(r.monthly.overdraft[35] > 0);
  assert.ok(total(r.monthly.overdraftInterest) > 0);
  assert.ok(r.warnings.some((w) => w.code === 'negative_equity'));
});

test('option matrix on the rich model reconciles', () => {
  const variants: Array<[string, (m: ReturnType<typeof richModel>) => void]> = [
    ['debit VAT', (m) => { m.tax.vatRegime = 'debit'; }],
    ['monthly VAT', (m) => { m.tax.vatPeriodicity = 'monthly'; }],
    ['quarterly VAT', (m) => { m.tax.vatPeriodicity = 'quarterly'; }],
    ['not VAT subject', (m) => { m.tax.vatSubject = false; }],
    ['IR professional', (m) => { m.tax.regime = 'ir_professional'; }],
    ['auto-entrepreneur', (m) => { m.tax.regime = 'auto_entrepreneur'; m.tax.vatSubject = false; m.tax.autoEntrepreneurRatePct = 1; }],
    ['fiscal year July', (m) => { m.horizon.fiscalYearStartMonth = 7; }],
    ['start mid-year', (m) => { m.horizon.startMonth = '2026-05'; }],
    ['industrial', (m) => { m.tax.isCategory = 'industrial'; }],
    ['override', (m) => { m.tax.overrides = [{ id: 'o', fromFiscalYear: 2027, isRatePct: 15, minimumContributionRatePct: 0.5, note: 'test' }]; }],
    ['exemption', (m) => { m.tax.exemptions = [{ id: 'x', tax: 'is', label: 'Exo', fromFiscalYearIndex: 1, toFiscalYearIndex: 3, reductionPct: 100, minimumContributionExempt: true, legalBasis: 'test' }]; }],
    ['local taxes', (m) => {
      m.tax.localTaxes = [
        { id: 'tp', name: 'TP', kind: 'tp', base: 'rental_value', ratePct: 10, amount: 0, baseAmount: 180000, startFiscalYearIndex: 1, exemptYears: 5, paymentMonthOfFiscalYear: 4, legalBasis: 'user' },
        { id: 'de', name: 'DE', kind: 'registration', base: 'investment', ratePct: 1, amount: 0, baseAmount: 0, startFiscalYearIndex: 1, exemptYears: 0, paymentMonthOfFiscalYear: 1, legalBasis: 'user' },
        { id: 'tsc', name: 'TSC', kind: 'tsc', base: 'fixed', ratePct: 0, amount: 4000, baseAmount: 0, startFiscalYearIndex: 1, exemptYears: 0, paymentMonthOfFiscalYear: 12, legalBasis: 'user' },
      ];
    }],
    ['dividend withholding', (m) => { m.financing.dividends.withholdingRatePct = 10; m.financing.dividends.payoutPct = 80; }],
    ['foreign currency', (m) => {
      m.general.exchangeRates = [{ currency: 'EUR', rateToMad: 10.8, annualChangePct: 1 }];
      m.products[0].currency = 'EUR';
      m.products[0].unitPrice = 25;
    }],
    ['no products', (m) => { m.products = []; }],
    ['no financing', (m) => { m.financing.loans = []; m.financing.equity = []; m.financing.grants = []; }],
    ['all cash sales, no delays', (m) => { m.workingCapital = { cashSalesPct: 100, dsoDays: 0, dpoDays: 0, inventoryDays: 0, badDebtPct: 0, minimumCash: 0 }; }],
    ['long delays', (m) => { m.workingCapital.dsoDays = 120; m.workingCapital.dpoDays = 95; m.workingCapital.inventoryDays = 75; }],
  ];
  for (const [name, mutate] of variants) {
    for (const years of [1, 3, 10]) {
      const m = richModel(years);
      mutate(m);
      assertReconciled(computeStudy(m), `${name} ${years}y`);
    }
  }
});

test('existing company with opening balance reconciles and consumes opening positions', () => {
  const m = richModel(5);
  m.projectType = 'existing';
  m.openingBalance = {
    enabled: true, cash: 150000, receivables: 220000, inventory: 90000, vatCredit: 12000,
    fixedAssetsGross: 800000, accumulatedDepreciation: 300000, remainingLifeYears: 5,
    payables: 140000, vatPayable: 30000, socialPayable: 25000, isPayable: 18000,
    debtBalance: 250000, debtAnnualRatePct: 6, debtRemainingMonths: 36,
    capital: 400000, reserves: 199000, priorYearIsDue: 18000,
  };
  const unbalanced = validateStudyModel(m);
  assert.equal(unbalanced.ok, false);
  assert.ok(unbalanced.issues.some((i) => i.path.startsWith('openingBalance') && i.severity === 'error'));
  m.openingBalance.reserves = 109000;
  const v = validateStudyModel(m);
  assert.deepEqual(v.issues.filter((i) => i.severity === 'error'), []);
  const r = computeStudy(v.model);
  assertReconciled(r, 'opening');
  // Opening debt is fully repaid inside the horizon and opening fixed assets are depreciated over the remaining life.
  const opening = r.loans.find((l) => l.kind === 'opening')!;
  assert.equal(opening.rows.at(-1)!.closing, 0);
  assert.equal(total(opening.rows.map((x) => x.principal)), 250000 * 100);
  assert.ok(!r.warnings.some((w) => w.code === 'opening_inventory_static'));
});

test('engine is deterministic', () => {
  const a = computeStudy(richModel(10));
  const b = computeStudy(richModel(10));
  assert.deepEqual(a.monthly, b.monthly);
});
