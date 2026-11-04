import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareStudies, type ComparedStudy } from '../../app/lib/business-studio/compare';
import { computeStudy } from '../../app/lib/business-studio/engine';
import { computeMetrics } from '../../app/lib/business-studio/metrics';
import type { StudyModel } from '../../app/lib/business-studio/model';
import { bakeryCase, workshopCase } from './cases';
import { richModel } from './fixtures';

const study = (name: string, model: StudyModel): ComparedStudy => {
  const r = computeStudy(model, model.activeScenarioId);
  return { name, model, r, x: computeMetrics(model, r) };
};

test('comparison values come from each study computed independently', () => {
  const a = study('Boulangerie', bakeryCase());
  const b = study('Atelier', workshopCase());
  const cmp = compareStudies(a, b);
  const row = (k: string) => cmp.rows.find((r) => r.key === k)!;
  assert.equal(row('revenue').a, a.x.totals.revenue);
  assert.equal(row('revenue').b, b.x.totals.revenue);
  assert.equal(row('revenue').diff, b.x.totals.revenue - a.x.totals.revenue);
  assert.equal(row('npv').a, a.x.npv.value);
  assert.equal(row('minDscr').b, b.x.minDscr.value);
  assert.equal(row('years').a, a.model.horizon.years);
  const n = Math.max(a.x.years.length, b.x.years.length);
  assert.equal(cmp.years.labels.length, n);
  assert.deepEqual(cmp.years.a.netIncome.slice(0, a.x.years.length), a.x.years.map((y) => y.netIncome));
  assert.ok(cmp.years.b.revenue.every((v, i) => (i < b.x.years.length ? v === b.x.years[i].revenue : v === null)));
});

test('comparison discloses differences that limit comparability', () => {
  const m5 = richModel(5, '2026-01');
  const m7 = richModel(7, '2026-07');
  m7.general.discountRatePct = 10;
  const cmp = compareStudies(study('A', m5), study('B', m7));
  const text = cmp.notes.map((n) => n.fr).join(' ');
  assert.match(text, /Horizons différents \(5 et 7 ans\)/);
  assert.match(text, /Dates de démarrage différentes/);
  assert.match(text, /Taux d’actualisation différents/);
  assert.ok(cmp.notes.every((n) => n.ar.length > 0));
  assert.equal(cmp.years.labels.length, Math.max(study('A', m5).x.years.length, study('B', m7).x.years.length));
  assert.deepEqual(compareStudies(study('A', m5), study('B', richModel(5, '2026-01'))).notes, []);
});
