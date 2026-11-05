import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStudy, FLOW_KEYS, BALANCE_KEYS } from '../../app/lib/business-studio/engine';
import { aggregate, computeMetrics, irr, npv, payback, periodsOf } from '../../app/lib/business-studio/metrics';
import { emptyModel, newExpense, newProduct } from '../../app/lib/business-studio/model';
import { richModel } from './fixtures';

const close = (a: number | null, b: number, eps = 1e-6) => {
  assert.ok(a != null, `expected ${b}, got null`);
  assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);
};

test('IRR of a 10 % annual investment is 10 %', () => {
  const flows = new Array(13).fill(0);
  flows[0] = -100000;
  flows[12] = 110000;
  const r = irr(flows);
  close(r.annualPct, 10, 1e-8);
  assert.equal(r.multipleSignChanges, false);
});

test('IRR undefined cases return null with a reason', () => {
  assert.equal(irr([0, 0]).annualPct, null);
  assert.match(irr([100, 200]).reason!, /négatif/);
  assert.match(irr([-100, -200]).reason!, /positif/);
  const multi = irr([-100, 230, -132]);
  assert.equal(multi.multipleSignChanges, true);
  assert.ok(multi.annualPct != null);
});

test('IRR on a 30-year monthly series converges', () => {
  const flows = new Array(360).fill(1000);
  flows[0] = -100000;
  const r = irr(flows);
  assert.ok(r.monthlyPct != null && r.monthlyPct > 0);
  let v = 0;
  for (let m = 0; m < flows.length; m += 1) v += flows[m] / Math.pow(1 + r.monthlyPct! / 100, m);
  assert.ok(Math.abs(v) < 1e-3);
});

test('NPV with end-of-month discounting and terminal value', () => {
  const rm = Math.pow(1.12, 1 / 12) - 1;
  const flows = [-1000, 500, 600];
  const expected = -1000 / (1 + rm) + 500 / (1 + rm) ** 2 + 600 / (1 + rm) ** 3;
  assert.equal(npv(flows, 12).npv, Math.round(expected));
  const withTv = npv(new Array(12).fill(100), 10, 2);
  assert.ok(withTv.terminalValue != null && withTv.terminalValue === Math.round((1200 * 1.02) / 0.08));
  assert.ok(npv([1], 5, 5).reason);
});

test('payback interpolates within the month (flows at month end)', () => {
  close(payback([-100, 50, 50, 50]).months, 3);
  close(payback([-100, 40, 40, 40]).months, 3 + 20 / 40);
  assert.equal(payback([-100, 10]).months, null);
  assert.equal(payback([10, 10]).months, 0);
});

test('aggregation: flows sum and balances close for every granularity', () => {
  const r = computeStudy(richModel(7));
  for (const g of ['month', 'quarter', 'year', 'horizon_year'] as const) {
    const periods = periodsOf(r, g);
    assert.equal(periods.reduce((s, p) => s + p.months.length, 0), r.calendar.months, g);
    for (const k of FLOW_KEYS) {
      const t = aggregate(r, k, g).reduce((s, v) => s + v, 0);
      assert.equal(t, r.monthly[k].reduce((s, v) => s + v, 0), `${g} ${k}`);
    }
    for (const k of BALANCE_KEYS) assert.equal(aggregate(r, k, g).at(-1), r.monthly[k].at(-1), `${g} ${k}`);
  }
});

test('break-even: 60 % contribution margin, 360 000 MAD fixed costs', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 1 });
  m.tax.applyMinimumContributionExemption = true;
  m.financing.equity = [{ id: 'q', name: 'c', amount: 10000, month: 0 }];
  m.products = [newProduct({ unitPrice: 100, volumeMonth1: 1000, unitCost: 40 })];
  m.expenses = [newExpense({ amountMonthly: 30000, vatRatePct: 0, indexedOnInflation: false })];
  const r = computeStudy(m);
  const x = computeMetrics(m, r);
  const y = x.years[0];
  assert.equal(y.revenue, 1200000 * 100);
  assert.equal(y.fixedCosts, 360000 * 100);
  assert.equal(y.breakEvenRevenue.value, 600000 * 100);
  close(y.safetyMarginPct.value, 50);
  assert.equal(y.breakEvenMonth.value, 5);
  close(y.grossMarginPct.value, 60);
});

test('zero revenue: ratios are null with reasons, never NaN', () => {
  const m = emptyModel({ startMonth: '2026-01', years: 2 });
  m.expenses = [newExpense({ amountMonthly: 1000, vatRatePct: 0 })];
  const x = computeMetrics(m, computeStudy(m));
  for (const y of x.years) {
    assert.equal(y.breakEvenRevenue.value, null);
    assert.ok(y.breakEvenRevenue.reason);
    assert.equal(y.grossMarginPct.value, null);
    assert.equal(y.dscr.value, null);
  }
  assert.equal(x.irrProject.value, null);
  const scan = JSON.stringify(x);
  assert.ok(!scan.includes('NaN') && !scan.includes('Infinity'));
});

test('rich model metrics are finite and consistent', () => {
  const m = richModel(10);
  m.general.terminalGrowthPct = 2;
  const r = computeStudy(m);
  const x = computeMetrics(m, r);
  assert.equal(x.years.length, r.calendar.fiscalYears.length);
  assert.equal(x.totals.revenue, r.monthly.revenue.reduce((s, v) => s + v, 0));
  assert.equal(x.years.reduce((s, y) => s + y.revenue, 0), x.totals.revenue);
  assert.ok(x.npvTerminal.value != null);
  assert.equal(x.saas, null);
  m.sector = 'saas';
  const saas = computeMetrics(m, computeStudy(m));
  assert.ok(saas.saas != null);
  assert.ok(saas.saas!.ltv.value != null && saas.saas!.cac.value != null);
  assert.ok(x.peakFundingNeed.value != null && x.peakFundingNeed.value >= 0);
  const scan = JSON.stringify(x);
  assert.ok(!scan.includes('NaN') && !scan.includes('Infinity'));
});
