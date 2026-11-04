import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStudy } from '../../app/lib/business-studio/engine';
import { STATEMENTS, lineIsFlow, statementTable, type StatementId } from '../../app/lib/business-studio/statements';
import { richModel } from './fixtures';

const row = (t: ReturnType<typeof statementTable>, id: string) => {
  const r = t.rows.find((x) => x.def.id === id);
  assert.ok(r, `row ${id} in ${t.id}`);
  return r!.values as number[];
};

test('no statement line mixes flows and balances', () => {
  for (const [id, st] of Object.entries(STATEMENTS)) {
    for (const def of st.lines) {
      if (def.terms.length === 0) continue;
      assert.notEqual(lineIsFlow(def), null, `${id}.${def.id}`);
      assert.ok(def.label.fr && def.label.ar, `${id}.${def.id} labels`);
    }
  }
});

test('statements reconcile for every granularity and several horizons', () => {
  for (const years of [1, 5, 30]) {
    const m = richModel(years);
    m.horizon.fiscalYearStartMonth = 7;
    const r = computeStudy(m);
    for (const g of ['month', 'quarter', 'year', 'horizon_year'] as const) {
      const T = (id: StatementId) => statementTable(r, id, g);
      const cpc = T('cpc');
      const n = cpc.periods.length;
      for (let i = 0; i < n; i += 1) {
        const ebit = row(cpc, 'opIncome')[i] - row(cpc, 'opCharges')[i];
        assert.equal(ebit, row(cpc, 'ebit')[i], `${years}y ${g} ebit`);
        // The incomeTax row is shown negated, so adding it subtracts the tax.
        assert.equal(row(cpc, 'currentResult')[i] + row(cpc, 'nonCurrentResult')[i], row(cpc, 'ebt')[i], `${years}y ${g} ebt`);
        assert.equal(row(cpc, 'ebt')[i] + row(cpc, 'incomeTax')[i], row(cpc, 'netIncome')[i], `${years}y ${g} net`);
      }
      const actif = T('bilan_actif');
      const passif = T('bilan_passif');
      assert.deepEqual(row(actif, 'totalAssets'), row(passif, 'totalLiabilitiesAndEquity'), `${years}y ${g} bilan`);
      const tft = T('tft');
      const tre = T('tresorerie');
      const fin = T('financement');
      const bfr = T('bfr');
      for (let i = 0; i < n; i += 1) {
        assert.equal(row(tft, 'caf')[i] + row(tft, 'capitalizedInterest')[i] + row(tft, 'dBfr')[i], row(tft, 'cfo')[i]);
        assert.equal(row(tft, 'cfo')[i] + row(tft, 'cfi')[i] + row(tft, 'cff')[i], row(tft, 'netCashFlow')[i]);
        assert.equal(row(tre, 'inflows')[i] - row(tre, 'outflows')[i], row(tre, 'netCashFlow')[i]);
        assert.equal(row(fin, 'resources')[i] - row(fin, 'uses')[i], row(fin, 'surplus')[i]);
        assert.equal(row(fin, 'capexCost')[i] + row(fin, 'dBfrUse')[i] + row(fin, 'cashOutPrincipal')[i] + row(fin, 'dividendsGross')[i], row(fin, 'uses')[i]);
        assert.equal(row(bfr, 'wcAssets')[i] - row(bfr, 'wcLiabilities')[i], row(bfr, 'bfr')[i]);
      }
    }
  }
});
