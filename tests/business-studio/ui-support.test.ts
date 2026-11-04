import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aggregateActuals, alignActuals } from '../../app/lib/business-studio/actuals';
import { computeWithLevers, mergeLevers } from '../../app/lib/business-studio/analysis';
import { computeStudy } from '../../app/lib/business-studio/engine';
import { RULE_STATUS_BI } from '../../app/lib/business-studio/i18n';
import { computeMetrics } from '../../app/lib/business-studio/metrics';
import { NEUTRAL_LEVERS, validateStudyModel, type Levers } from '../../app/lib/business-studio/model';
import { buildReport } from '../../app/lib/business-studio/report-model';
import { RULES, RULE_STATUS_LABEL } from '../../app/lib/business-studio/tax-rules';
import { LEVER_DEFS } from '../../app/etude-projet/_studio/analysis-ui';
import { richModel } from './fixtures';

test('a simulation saved as a scenario reproduces the simulated figures exactly', () => {
  const m = richModel(6);
  const deltas: Partial<Levers> = { priceFactorPct: 7, volumeFactorPct: -12, dsoDeltaDays: 15, isRateOverridePct: 25 };
  const sim = computeWithLevers(m, deltas);
  const active = m.scenarios.find((s) => s.id === m.activeScenarioId)!;
  const saved = { ...m, scenarios: [...m.scenarios, { ...active, id: 'saved', kind: 'custom' as const, levers: mergeLevers(active.levers, deltas), parentId: active.id }], activeScenarioId: 'saved' };
  assert.ok(validateStudyModel(saved).ok);
  const r = computeStudy(saved);
  const x = computeMetrics(saved, r);
  assert.equal(x.totals.netIncome, sim.metrics.totals.netIncome);
  assert.equal(x.cashEnd.value, sim.metrics.cashEnd.value);
  assert.equal(x.npv.value, sim.metrics.npv.value);
  assert.deepEqual(r.monthly.cash, sim.result.monthly.cash);
});

test('mergeLevers adds deltas, replaces the IS override and ignores null', () => {
  const base: Levers = { ...NEUTRAL_LEVERS, priceFactorPct: 5, isRateOverridePct: 20 };
  const out = mergeLevers(base, { priceFactorPct: 3, isRateOverridePct: 31, volumeFactorPct: undefined });
  assert.equal(out.priceFactorPct, 8);
  assert.equal(out.isRateOverridePct, 31);
  assert.equal(out.volumeFactorPct, 0);
  assert.equal(mergeLevers(base, { isRateOverridePct: null }).isRateOverridePct, 20);
});

test('every lever slider bound is accepted by the server validator', () => {
  const ids = new Set(LEVER_DEFS.map((l) => l.id));
  for (const k of Object.keys(NEUTRAL_LEVERS)) if (k !== 'isRateOverridePct') assert.ok(ids.has(k as never), `lever ${k} has no slider`);
  for (const l of LEVER_DEFS) {
    for (const v of [l.min, l.max]) {
      const m = richModel(3);
      m.scenarios = m.scenarios.map((s) => (s.id === 'base' ? s : { ...s, levers: { ...s.levers, [l.id]: v } }));
      const res = validateStudyModel(m);
      assert.ok(res.ok, `${l.id}=${v}: ${JSON.stringify(res.issues.filter((i) => i.severity === 'error'))}`);
    }
  }
});

test('logo accepts only PNG/JPEG base64 data URLs', () => {
  const withLogo = (logo: string) => {
    const m = richModel(2);
    m.profile.company.logoDataUrl = logo;
    return validateStudyModel(m);
  };
  assert.ok(withLogo('').ok);
  assert.ok(withLogo('data:image/png;base64,iVBORw0KGgo=').ok);
  assert.ok(withLogo('data:image/jpeg;base64,/9j/4AAQSkZJRg==').ok);
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'javascript:alert(1)', 'https://example.com/logo.png', 'data:image/png;base64,<script>']) {
    const res = withLogo(bad);
    assert.equal(res.ok, false, bad);
    assert.equal(res.model.profile.company.logoDataUrl, '');
  }
});

test('alignActuals re-indexes onto a different calendar without inventing values', () => {
  const a = aggregateActuals([
    { date: '2026-02-10', account: '7111', debit: 0, credit: 1000, status: 'validated' },
    { date: '2026-03-05', account: '6111', debit: 400, credit: 0, status: 'validated' },
  ], ['2026-01', '2026-02', '2026-03']);
  const b = alignActuals(a, ['2026-02', '2026-03', '2026-04']);
  assert.deepEqual(b.months, ['2026-02', '2026-03', '2026-04']);
  assert.deepEqual(b.series.revenue, [100000, 0, 0]);
  assert.deepEqual(b.series.cogs, [0, 40000, 0]);
  assert.deepEqual(b.series.netIncome, [100000, -40000, 0]);
  assert.equal(b.lineCount, a.lineCount);
});

test('rule statuses have French and Arabic labels, and Arabic reports use the Arabic ones', () => {
  for (const s of Object.keys(RULE_STATUS_LABEL) as Array<keyof typeof RULE_STATUS_LABEL>) {
    assert.equal(RULE_STATUS_BI[s].fr, RULE_STATUS_LABEL[s]);
    assert.ok(/[\u0600-\u06FF]/.test(RULE_STATUS_BI[s].ar), s);
  }
  for (const r of RULES) assert.ok(RULE_STATUS_BI[r.status]);
  const m = richModel(3);
  const result = computeStudy(m);
  const metrics = computeMetrics(m, result);
  const report = buildReport({ type: 'tax', lang: 'ar', model: m, result, metrics, studyName: 'T' });
  const text = JSON.stringify(report);
  for (const fr of Object.values(RULE_STATUS_LABEL)) assert.ok(!text.includes(fr), `French status leaked: ${fr}`);
});
