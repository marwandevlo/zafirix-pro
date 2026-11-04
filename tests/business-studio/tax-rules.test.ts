import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RULES, irAnnual, isLegalVatRate, legalDecliningCoefficient, minimumContributionRatePct, monthlyPayroll, resolveIsRate,
} from '../../app/lib/business-studio/tax-rules';

test('every rule has a status and a source unless user-defined or not covered', () => {
  for (const r of RULES) {
    assert.ok(r.status, r.id);
    if (r.status === 'verified_official' || r.status === 'verified_regulator') {
      assert.ok(r.source && r.source.document && r.source.reference, `${r.id} needs a source`);
    }
  }
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'rule ids are unique');
});

test('IS 2026 (art. 19-I as amended by LF 2023)', () => {
  assert.equal(resolveIsRate(500_000, 2026, 'standard')!.ratePct, 20);
  assert.equal(resolveIsRate(99_999_999, 2026, 'standard')!.ratePct, 20);
  assert.equal(resolveIsRate(100_000_000, 2026, 'standard')!.ratePct, 35);
  assert.equal(resolveIsRate(5_000_000, 2026, 'credit_insurance')!.ratePct, 40);
  assert.equal(resolveIsRate(5_000_000, 2026, 'standard')!.status, 'verified_official');
  assert.equal(resolveIsRate(5_000_000, 2027, 'standard')!.status, 'assumed_unchanged');
});

test('IS 2023–2025 transitional rates (art. 247-XXXVII-A)', () => {
  const rates = (taxable: number, cat: Parameters<typeof resolveIsRate>[2]) => [2023, 2024, 2025].map((y) => resolveIsRate(taxable, y, cat)!.ratePct);
  assert.deepEqual(rates(200_000, 'standard'), [12.5, 15, 17.5]);
  assert.deepEqual(rates(800_000, 'standard'), [20, 20, 20]);
  assert.deepEqual(rates(5_000_000, 'standard'), [28.25, 25.5, 22.75]);
  assert.deepEqual(rates(150_000_000, 'standard'), [32, 33, 34]);
  assert.deepEqual(rates(5_000_000, 'industrial'), [24.5, 23, 21.5]);
  assert.deepEqual(rates(5_000_000, 'zai_cfc'), [16.25, 17.5, 18.75]);
  assert.deepEqual(rates(5_000_000, 'credit_insurance'), [37.75, 38.5, 39.25]);
  assert.deepEqual(rates(5_000_000, 'former_20pct_sector'), [20, 20, 20]);
  assert.deepEqual(rates(150_000_000, 'former_20pct_sector'), [23.75, 27.5, 31.25]);
  assert.equal(resolveIsRate(5_000_000, 2022, 'standard'), null, 'no invented rate before 2023');
});

test('minimum contribution and declining coefficients', () => {
  assert.equal(minimumContributionRatePct(2026).ratePct, 0.25);
  assert.equal(minimumContributionRatePct(2026).status, 'verified_official');
  assert.equal(minimumContributionRatePct(2022).status, 'convention');
  assert.equal(legalDecliningCoefficient(2), null);
  assert.equal(legalDecliningCoefficient(4), 1.5);
  assert.equal(legalDecliningCoefficient(6), 2);
  assert.equal(legalDecliningCoefficient(10), 3);
});

test('IR annual scale (art. 73-I from 2025)', () => {
  assert.equal(irAnnual(40_000), 0);
  assert.equal(irAnnual(60_000), 2_000);
  assert.equal(irAnnual(80_000), 6_000);
  assert.equal(irAnnual(100_000), 12_000);
  assert.equal(irAnnual(180_000), 39_200);
  assert.ok(Math.abs(irAnnual(200_000) - 46_600) < 1e-9);
});

test('payroll worked example: 10 000 MAD gross, 2026', () => {
  const p = monthlyPayroll(10_000, 0, 2026);
  assert.equal(p.cnssEmployee, 268.8);
  assert.equal(p.amoEmployee, 226);
  assert.equal(p.professionalExpenses, 2500);
  assert.equal(p.taxableBase, 7005.2);
  // Annual base 84 062.40 → 2 000 + 4 000 + 30 % × 4 062.40 = 7 218.72 per year.
  assert.equal(p.ir, 601.56);
  assert.equal(p.net, 8903.64);
  assert.equal(p.cnssEmployer, 1178.8);
  assert.equal(p.amoEmployer, 411);
  assert.equal(p.tfpEmployer, 160);
  const withKids = monthlyPayroll(10_000, 3, 2026);
  assert.equal(withKids.familyReduction, 150);
  assert.equal(withKids.ir, 451.56);
  assert.equal(monthlyPayroll(10_000, 3, 2025).familyReduction, 0);
  const low = monthlyPayroll(3_000, 0, 2026);
  assert.equal(low.ir, 0);
  assert.equal(low.professionalExpenses, 1050);
});

test('VAT rates by date (art. 99 and 247-XXXXI)', () => {
  assert.ok(isLegalVatRate(20, '2026-03-01'));
  assert.ok(isLegalVatRate(10, '2026-03-01'));
  assert.ok(!isLegalVatRate(14, '2026-03-01'));
  assert.ok(isLegalVatRate(14, '2023-06-01'));
  assert.ok(isLegalVatRate(18, '2025-06-01'));
});
