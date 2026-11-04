import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { computeStudy } from '../../app/lib/business-studio/engine';
import { formatCentsMad } from '../../app/lib/business-studio/i18n';
import { computeMetrics, firstFullYear } from '../../app/lib/business-studio/metrics';
import { newExpense, newStaff } from '../../app/lib/business-studio/model';
import { buildReport, formatCell, type Block } from '../../app/lib/business-studio/report-model';
import { renderReportPdf } from '../../app/lib/business-studio/report-pdf';
import { bakeryCase } from './cases';

/** Horizon opening in December: the first fiscal year is a one-month stub and the last one has eleven months. */
function decemberBakery() {
  const model = bakeryCase(7, '2026-12');
  const result = computeStudy(model);
  const metrics = computeMetrics(model, result);
  return { model, result, metrics };
}

const blocksOf = (type: 'full' | 'bank', lang: 'fr' | 'ar', s = decemberBakery()) =>
  buildReport({ type, lang, model: s.model, result: s.result, metrics: s.metrics, studyName: 'Boulangerie' }).sections.flatMap((x) => x.blocks);

test('break-even is read on the first complete fiscal year, not on a one-month opening stub', () => {
  const { metrics } = decemberBakery();
  assert.equal(metrics.years[0].partial, true);
  const ref = firstFullYear(metrics)!;
  assert.equal(ref.label, '2027');
  assert.equal(ref.partial, false);
  const kv = blocksOf('full', 'fr').find((b): b is Extract<Block, { kind: 'kv' }> => b.kind === 'kv' && b.rows.some((r) => r.label.startsWith('Point mort')))!;
  const row = kv.rows.find((r) => r.label.startsWith('Point mort'))!;
  assert.equal(row.label, 'Point mort (1er exercice complet)');
  assert.equal(row.note, '2027');
  assert.ok('v' in row.cell && row.cell.v === ref.breakEvenRevenue.value && row.cell.u === 'mad');
});

test('executive summary growth compares complete fiscal years only', () => {
  const s = decemberBakery();
  const full = s.metrics.years.filter((y) => !y.partial);
  const a = full[0];
  const b = full[full.length - 1];
  const list = blocksOf('full', 'fr', s).find((x): x is Extract<Block, { kind: 'list' }> => x.kind === 'list' && x.items.some((i) => i.startsWith('Chiffre d’affaires')))!;
  const line = list.items.find((i) => i.startsWith('Chiffre d’affaires'))!;
  assert.ok(line.includes(`en ${a.label}`) && line.includes(`en ${b.label}`), line);
  assert.ok(!line.includes('2026') && !line.includes('2033'), line);
  assert.match(line, /entre exercices complets/);
  assert.doesNotMatch(line, /partiels compris/);
  const ar = blocksOf('full', 'ar', s).find((x): x is Extract<Block, { kind: 'list' }> => x.kind === 'list')!;
  assert.ok(ar.items.some((i) => i.includes('بين السنوات المالية الكاملة')));
});

test('KPI summary carries both shareholder IRRs', () => {
  const s = decemberBakery();
  const kv = blocksOf('full', 'fr', s).find((b): b is Extract<Block, { kind: 'kv' }> => b.kind === 'kv' && b.rows.some((r) => r.label === 'TRI actionnaires'))!;
  const book = kv.rows.find((r) => r.label === 'TRI actionnaires (sortie comptable)');
  assert.ok(book);
  assert.equal(book.cell && 'v' in book.cell ? book.cell.v : undefined, s.metrics.irrEquityWithBookValue.value);
});

test('unit prices and costs keep their centimes; statement amounts stay in whole MAD', () => {
  assert.equal(formatCell({ v: 450, u: 'mad_unit' }, 'fr'), '4,50');
  assert.equal(formatCell({ v: 1200, u: 'mad_unit' }, 'fr'), '12');
  assert.equal(formatCell({ v: 155, u: 'mad_unit' }, 'ar'), '1.55');
  assert.equal(formatCell({ v: 12345, u: 'mad' }, 'fr'), '123');
  const table = blocksOf('full', 'fr').find((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table' && b.title === 'Produits et services')!;
  const pain = table.rows.find((r) => r.label === 'Pain')!;
  assert.equal(formatCell(pain.cells[1], 'fr'), '1,50');
  assert.equal(formatCell(pain.cells[4], 'fr'), '0,55');
});

test('assumption lines without an amount are left out of reports, with a notice', () => {
  const s = decemberBakery();
  s.model.expenses.push(newExpense({ name: 'Ligne vide du modèle', amountMonthly: 0 }));
  s.model.staff.push(newStaff({ role: 'Poste non pourvu', headcount: 1, grossMonthly: 0 }));
  const blocks = blocksOf('full', 'fr', s);
  const tables = blocks.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table');
  assert.ok(!tables.some((t) => t.rows.some((r) => r.label === 'Ligne vide du modèle' || r.label === 'Poste non pourvu')));
  const before = blocksOf('full', 'fr').find((b) => b.kind === 'notice' && /sans montant/.test(b.text));
  const baseline = before && before.kind === 'notice' ? Number(before.text.split(' ')[0]) : 0;
  assert.ok(blocks.some((b) => b.kind === 'notice' && b.text.startsWith(`${baseline + 2} ligne(s) d’hypothèse sans montant`)));
});

test('PDF period tables keep every amount on one line (French and Arabic, 7 and 30 years)', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = `${join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/')}/`;
  const { readFileSync } = await import('node:fs');
  const fontDir = join(process.cwd(), 'public', 'fonts', 'amiri');
  const fonts = { regular: readFileSync(join(fontDir, 'Amiri-Regular.ttf')).toString('base64'), bold: readFileSync(join(fontDir, 'Amiri-Bold.ttf')).toString('base64') };
  for (const years of [7, 30]) {
    const model = bakeryCase(years, '2026-12');
    const result = computeStudy(model);
    const metrics = computeMetrics(model, result);
    for (const lang of ['fr', 'ar'] as const) {
      const report = buildReport({ type: 'full', lang, model, result, metrics, studyName: 'Boulangerie' });
      const data = renderReportPdf(report, lang === 'ar' ? fonts : undefined);
      const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
      const items = new Set<string>();
      for (let p = 1; p <= doc.numPages; p += 1) {
        for (const it of (await (await doc.getPage(p)).getTextContent()).items) if ('str' in it) items.add(it.str.replace(/[\s\u00a0\u202f]/g, ''));
      }
      const expected = [...metrics.years.map((y) => y.revenue), ...metrics.years.map((y) => y.netDebtEnd)]
        .map((v) => formatCentsMad(v, lang).replace(/[\s\u00a0\u202f]/g, ''))
        .filter((s) => s.replace(/\D/g, '').length >= 6);
      const missing = expected.filter((s) => ![...items].some((i) => i === s || i.endsWith(s) || i.startsWith(s) || i === `${s.replace(/^-/, '')}-`));
      assert.deepEqual(missing, [], `${years} years ${lang}: amounts split across lines`);
    }
  }
});
