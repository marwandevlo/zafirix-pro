import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aggregateActuals, categorize, variance } from '../../app/lib/business-studio/actuals';
import { compareScenarios, computeWithLevers, findings, runStressTests, sensitivityMatrix, tornado } from '../../app/lib/business-studio/analysis';
import { computeStudy } from '../../app/lib/business-studio/engine';
import { importLegacyStudy, mapLegacyLegalForm, parseLegacyNumber } from '../../app/lib/business-studio/legacy-import';
import { computeMetrics } from '../../app/lib/business-studio/metrics';
import { SECTORS, validateStudyModel } from '../../app/lib/business-studio/model';
import { modelFromTemplate, sectorKpis, SECTOR_TEMPLATES } from '../../app/lib/business-studio/sectors';
import { richModel } from './fixtures';

test('simulator with neutral levers equals the scenario run', () => {
  const m = richModel(5);
  const a = computeStudy(m, 'base');
  const b = computeWithLevers(m, {}, 'base').result;
  assert.deepEqual(a.monthly, b.monthly);
  const up = computeWithLevers(m, { priceFactorPct: 10 }, 'base');
  assert.ok(up.metrics.totals.revenue > computeMetrics(m, a).totals.revenue);
  assert.ok(up.result.checks.ok);
});

test('simulator levers stack on the selected scenario', () => {
  const m = richModel(3);
  const pes = computeStudy(m, 'pessimistic');
  const same = computeWithLevers(m, {}, 'pessimistic').result;
  assert.deepEqual(pes.monthly.revenue, same.monthly.revenue);
});

test('tornado, matrix and stress tests run and reconcile', () => {
  const m = richModel(5);
  const bars = tornado(m, 'npv');
  assert.ok(bars.length >= 8);
  for (let i = 1; i < bars.length; i += 1) {
    const s = (b: typeof bars[number]) => Math.abs((b.valueHigh ?? 0) - (b.valueLow ?? 0));
    assert.ok(s(bars[i - 1]) >= s(bars[i]), 'sorted by impact');
  }
  const price = bars.find((b) => b.lever.id === 'priceFactorPct')!;
  assert.ok(price.valueHigh! > price.valueLow!);
  const mx = sensitivityMatrix(m, 'priceFactorPct', 'volumeFactorPct', [-10, 0, 10], [-10, 0, 10], 'netIncome');
  assert.equal(mx.values.length, 3);
  assert.ok(mx.values[2][2]! > mx.values[0][0]!);
  const stress = runStressTests(m);
  assert.ok(stress.length >= 6);
  assert.ok(stress.every((s) => Number.isFinite(s.netIncome)));
});

test('scenario comparison covers all scenarios', () => {
  const m = richModel(5);
  const s = compareScenarios(m);
  assert.deepEqual(s.map((x) => x.id), ['base', 'optimistic', 'pessimistic']);
  assert.ok(s.every((x) => x.result.checks.ok));
});

test('findings are traceable and typed', () => {
  const m = richModel(5);
  m.products[0].volumeGrowthPct = [80];
  const r = computeStudy(m);
  const f = findings(m, r, computeMetrics(m, r));
  assert.ok(f.length > 0);
  for (const x of f) {
    assert.ok(['calculated', 'assumption', 'convention'].includes(x.kind));
    assert.ok(x.title);
  }
  assert.ok(f.some((x) => x.kind === 'assumption' && x.id.startsWith('growth-')));
});

test('every sector template validates, runs and yields KPIs', () => {
  assert.equal(Object.keys(SECTOR_TEMPLATES).length, SECTORS.length);
  for (const s of SECTORS) {
    const m = modelFromTemplate(s, { startMonth: '2026-01', years: 3 });
    const v = validateStudyModel(m);
    assert.deepEqual(v.issues.filter((i) => i.severity === 'error'), [], s);
    const allZero = m.products.every((p) => p.unitPrice === 0) && m.expenses.every((e) => e.amountMonthly === 0) && m.investments.every((i) => i.amountHT === 0);
    assert.ok(allZero, `${s}: templates carry no invented amounts`);
    const r = computeStudy(v.model);
    assert.ok(r.checks.ok, s);
    const k = sectorKpis(v.model, r, computeMetrics(v.model, r));
    assert.ok(k.length >= 2, s);
    for (const kpi of k) assert.equal(kpi.values.length, r.calendar.fiscalYears.length);
  }
});

test('sector KPI uses the sector input', () => {
  const m = modelFromTemplate('retail', { startMonth: '2026-01', years: 2 });
  m.products[0].unitPrice = 100;
  m.products[0].volumeMonth1 = 100;
  m.sectorInputs.salesAreaM2 = 50;
  const r = computeStudy(m);
  const k = sectorKpis(m, r, computeMetrics(m, r)).find((x) => x.id === 'revenuePer_salesAreaM2')!;
  assert.equal(k.values[0], (100 * 100 * 12 * 100) / 50);
});

test('legacy import keeps user answers only and drops identity data', () => {
  const res = importLegacyStudy({
    id: 'x', name: 'Café Atlas', createdAt: '2026-03-10T10:00:00Z',
    metadata: {
      kind: 'etude_faisabilite', step: 22, etudeReady: true, etudeText: 'texte IA',
      wizardData: {
        nom_projet: 'Café Atlas', secteur: 'Restauration', forme_juridique: '2', ville: 'Rabat', description: 'Café de quartier',
        financement: '2', raison_sociale: 'Atlas Café SARL AU', adresse_societe: '1 rue X', capital: '100 000', rc: 'en cours',
        if_fiscal: '1234567', ice: '001234567000089', cnss: 'en cours', nom_gerant: 'A. B.', cin: 'AB123456', date_naissance: '01/01/1990',
        adresse_gerant: 'secret', loyer: '8000', employes: '3', ca_prevu: '60 000', charges: '5 000,50',
      },
      financials: { is: 99999, totalSalaires: 13500 },
    },
  });
  const m = res.model;
  assert.equal(m.sector, 'hospitality');
  assert.equal(m.profile.company.legalForm, 'sarl_au');
  assert.equal(m.profile.company.rc, '');
  assert.equal(m.profile.company.if, '1234567');
  assert.equal(m.horizon.startMonth, '2026-03');
  assert.equal(m.financing.equity[0].amount, 100000);
  assert.equal(m.products[0].unitPrice, 60000);
  assert.equal(m.expenses.find((e) => e.category === 'other')!.amountMonthly, 5000.5);
  assert.equal(m.staff[0].grossMonthly, 0);
  const json = JSON.stringify(m);
  assert.ok(!json.includes('AB123456') && !json.includes('secret') && !json.includes('01/01/1990') && !json.includes('texte IA'));
  assert.ok(validateStudyModel(m).ok);
  assert.ok(computeStudy(m).checks.ok);
  assert.equal(parseLegacyNumber('1.234,50'), 1234.5);
  assert.equal(parseLegacyNumber('12 000 MAD'), 12000);
  assert.equal(parseLegacyNumber('abc'), null);
  assert.equal(mapLegacyLegalForm('1'), 'auto_entrepreneur');
});

test('actuals: CGNC mapping, status filter and variance', () => {
  assert.equal(categorize('71110000'), 'revenue');
  assert.equal(categorize('6111'), 'cogs');
  assert.equal(categorize('6171'), 'staffCosts');
  assert.equal(categorize('4455'), null);
  const labels = ['2026-01', '2026-02'];
  const a = aggregateActuals([
    { date: '2026-01-15', account: '7111', debit: 0, credit: 1000, status: 'validated' },
    { date: '2026-01-15', account: '6111', debit: 400, credit: 0, status: 'validated' },
    { date: '2026-01-20', account: '5141', debit: 1200, credit: 0, status: 'validated' },
    { date: '2026-02-01', account: '7111', debit: 0, credit: 999, status: 'draft' },
    { date: '2026-02-01', account: '7111', debit: 0, credit: 5, status: 'rejected' },
    { date: '2025-12-31', account: '7111', debit: 0, credit: 7, status: 'validated' },
  ], labels);
  assert.deepEqual(a.series.revenue, [100000, 0]);
  assert.deepEqual(a.series.netIncome, [60000, 0]);
  assert.deepEqual(a.series.cashMovement, [120000, 0]);
  assert.equal(a.ignoredLines, 3);
  const withDrafts = aggregateActuals([{ date: '2026-02-01', account: '7111', debit: 0, credit: 999, status: 'draft' }], labels, ['validated', 'draft']);
  assert.deepEqual(withDrafts.series.revenue, [0, 99900]);
  const m = richModel(1);
  const r = computeStudy(m);
  const rows = variance(r, aggregateActuals([], r.calendar.labels), 0, 11);
  const rev = rows.find((x) => x.key === 'revenue')!;
  assert.equal(rev.actual, 0);
  assert.equal(rev.variance, -rev.forecast);
});
