import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBalancedJournal,
  buildJournalLines,
  UNBALANCED_JOURNAL_MESSAGE,
} from '@/app/lib/atlas-documents-accounting-engine';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';
import { linkedInvoiceIds, planDraftEntryCorrection } from '@/app/lib/atlas-correction-propagation';
import { isSameInvoice } from '@/app/lib/atlas-invoice-duplicates';
import type { AtlasStructuredExtraction } from '@/app/types/atlas-document';

function extraction(overrides: Record<string, string | number> = {}): AtlasStructuredExtraction {
  const values: Record<string, string | number> = {
    supplier_name: 'Fournisseur',
    customer_name: 'Client',
    invoice_number: 'A-1',
    invoice_date: '2026-03-15',
    subtotal_ht: 100,
    tva_amount: 20,
    total_ttc: 120,
    ...overrides,
  };
  const out: Record<string, { value: string | number }> = {};
  for (const [key, value] of Object.entries(values)) out[key] = { value };
  return out as unknown as AtlasStructuredExtraction;
}

function totals(lines: Array<{ debit: number; credit: number }>) {
  return {
    debit: Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100),
    credit: Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100),
  };
}

const unbalanced = (err: unknown) => err instanceof Error && err.message === UNBALANCED_JOURNAL_MESSAGE;

describe('RC2 balanced posting', () => {
  it('posts a balanced purchase and a balanced sale', () => {
    for (const isPurchase of [true, false]) {
      const t = totals(buildJournalLines('doc-1', extraction(), isPurchase, 'inv-1'));
      assert.equal(t.debit, t.credit);
      assert.equal(t.debit, 12000);
    }
  });

  it('rejects a TTC-only extraction instead of posting a lone supplier credit', () => {
    assert.throws(
      () => buildJournalLines('doc-1', extraction({ subtotal_ht: 0, tva_amount: 0, total_ttc: 860076.83 }), true, 'inv-1'),
      unbalanced,
    );
  });

  it('rejects a purchase or sale whose TTC differs from HT + TVA', () => {
    assert.throws(() => buildJournalLines('doc-1', extraction({ total_ttc: 150 }), true, 'inv-1'), unbalanced);
    assert.throws(
      () => buildJournalLines('doc-1', extraction({ subtotal_ht: 1000, tva_amount: 200, total_ttc: 1260 }), false, 'inv-1'),
      unbalanced,
    );
  });

  it('absorbs a one-centime rounding gap so the posted entry is exactly balanced', () => {
    for (const isPurchase of [true, false]) {
      const t = totals(
        buildJournalLines('doc-1', extraction({ subtotal_ht: 333.33, tva_amount: 66.67, total_ttc: 400.01 }), isPurchase, 'inv-1'),
      );
      assert.equal(t.debit, t.credit);
      assert.equal(t.debit, 40000);
    }
  });

  it('still refuses a two-centime gap', () => {
    assert.throws(
      () => buildJournalLines('doc-1', extraction({ subtotal_ht: 333.33, tva_amount: 66.67, total_ttc: 400.02 }), true, 'inv-1'),
      unbalanced,
    );
  });

  it('returns no lines (and does not throw) when there is no usable date', () => {
    assert.deepEqual(buildJournalLines('doc-1', extraction({ invoice_date: '' }), true, 'inv-1'), []);
  });

  it('refuses one-sided or zero entries in assertBalancedJournal', () => {
    assert.throws(() => assertBalancedJournal([{ debit: 0, credit: 100 }]), unbalanced);
    assert.throws(() => assertBalancedJournal([{ debit: 0, credit: 0 }, { debit: 0, credit: 0 }]), unbalanced);
    assert.doesNotThrow(() => assertBalancedJournal([{ debit: 50, credit: 0 }, { debit: 0, credit: 50 }]));
    assert.doesNotThrow(() => assertBalancedJournal([]));
  });
});

describe('RC2 liasse company scope', () => {
  function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
    return {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        const rows = () => (tables[table] ?? []).filter((row) => filters.every(([k, v]) => row[k] === v));
        const builder: Record<string, unknown> = {
          select: () => builder,
          order: () => builder,
          limit: () => builder,
          gte: () => builder,
          lte: () => builder,
          in: () => builder,
          is: () => builder,
          eq: (k: string, v: unknown) => { filters.push([k, v]); return builder; },
          maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null }),
        };
        return builder;
      },
    };
  }

  it('leaves journal lines without a company out of a company liasse', async () => {
    const line = (company_id: string | null, compte: string, debit: number, credit: number) => ({
      user_id: 'u1',
      company_id,
      entry_date: '2026-05-10',
      validation_status: 'draft',
      entry_json: { compte, debit, credit, date: '2026-05-10' },
    });
    const db = fakeDb({
      atlas_accounting_entries: [line('co-1', '6111', 100, 0), line('co-1', '4411', 0, 100), line(null, '4411', 0, 500)],
    });
    const run = (companyId: string | null) =>
      runLiasseEngine(db as unknown as Parameters<typeof runLiasseEngine>[0], { userId: 'u1', companyId, fiscalYear: 2026 });
    assert.equal((await run('co-1')).checks.some((c) => c.id === 'accounting-unbalanced'), false);
    assert.equal((await run(null)).checks.some((c) => c.id === 'accounting-unbalanced'), true);
  });
});

describe('RC2 re-uploaded invoices', () => {
  const base = { number: 'FA 2026-014', date: '2026-02-10', ttc: 1200, counterparty: 'Société Atlas SARL', ice: null };

  it('recognises the same invoice despite spacing, case and accents', () => {
    assert.equal(isSameInvoice(base, { ...base, number: 'fa2026-014', counterparty: 'SOCIETE ATLAS sarl', ttc: 1200.01 }), true);
  });

  it('prefers the ICE when both records have one', () => {
    assert.equal(isSameInvoice({ ...base, ice: '001234567000089' }, { ...base, counterparty: 'Autre nom', ice: '001234567000089' }), true);
    assert.equal(isSameInvoice({ ...base, ice: '001234567000089' }, { ...base, ice: '009999999000011' }), false);
  });

  it('does not match when any element differs or is missing', () => {
    assert.equal(isSameInvoice(base, { ...base, ttc: 1200.5 }), false);
    assert.equal(isSameInvoice(base, { ...base, date: '2026-02-11' }), false);
    assert.equal(isSameInvoice(base, { ...base, counterparty: 'Autre fournisseur' }), false);
    assert.equal(isSameInvoice(base, { ...base, counterparty: '' }), false);
    assert.equal(isSameInvoice({ ...base, number: '' }, { ...base, number: '' }), false);
  });
});

describe('RC2 correction propagation', () => {
  const entry = (id: string, compte: string, debit: number, credit: number, status = 'draft', invoice = 'inv-1') => ({
    id,
    validation_status: status,
    entry_json: { compte, debit, credit },
    source_invoice_id: invoice,
  });
  const change = (field: string, value: number) => ({ field, old_value: null, new_value: value });

  it('counts every invoice a document is linked to', () => {
    assert.equal(linkedInvoiceIds(['inv-1'], [entry('a', '61400', 100, 0)]).size, 1);
    assert.equal(linkedInvoiceIds([], [entry('a', '61400', 100, 0), entry('b', '44100', 0, 100, 'draft', 'inv-2')]).size, 2);
  });

  it('applies a consistent HT/TVA/TTC correction to the production account codes', () => {
    const plan = planDraftEntryCorrection(
      [entry('a', '61400', 100, 0), entry('b', '34551', 20, 0), entry('c', '44100', 0, 120)],
      { subtotal_ht: change('subtotal_ht', 200), tva_amount: change('tva_amount', 40), total_ttc: change('total_ttc', 240) },
    );
    assert.equal(plan.balanced, true);
    assert.deepEqual(plan.planned.map((p) => [p.entry_json.debit, p.entry_json.credit]), [[200, 0], [40, 0], [0, 240]]);
  });

  it('corrects a sale on 34210 / 71100 / 44550', () => {
    const plan = planDraftEntryCorrection(
      [entry('a', '34210', 120, 0), entry('b', '71100', 0, 100), entry('c', '44550', 0, 20)],
      { subtotal_ht: change('subtotal_ht', 300), tva_amount: change('tva_amount', 60), total_ttc: change('total_ttc', 360) },
    );
    assert.equal(plan.balanced, true);
    assert.deepEqual(plan.planned.map((p) => [p.entry_json.debit, p.entry_json.credit]), [[360, 0], [0, 300], [0, 60]]);
  });

  it('flags a correction that would unbalance the entry', () => {
    const plan = planDraftEntryCorrection(
      [entry('a', '61400', 100, 0), entry('b', '34551', 20, 0), entry('c', '44100', 0, 120)],
      { total_ttc: change('total_ttc', 150) },
    );
    assert.equal(plan.balanced, false);
  });

  it('never plans a change to a validated line', () => {
    const plan = planDraftEntryCorrection(
      [entry('a', '61400', 100, 0, 'validated'), entry('c', '44100', 0, 100)],
      { subtotal_ht: change('subtotal_ht', 90) },
    );
    assert.deepEqual(plan.immutableIds, ['a']);
    assert.deepEqual(plan.planned.map((p) => p.id), ['c']);
  });
});
