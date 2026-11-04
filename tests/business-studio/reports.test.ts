import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

import { aggregateActuals } from '../../app/lib/business-studio/actuals';
import { computeStudy } from '../../app/lib/business-studio/engine';
import { formatCentsMad, formatNumber, monthLabel } from '../../app/lib/business-studio/i18n';
import { computeMetrics } from '../../app/lib/business-studio/metrics';
import { newRisk } from '../../app/lib/business-studio/model';
import { buildReport, formatCell, REPORT_TYPES, structureCharts, type Block } from '../../app/lib/business-studio/report-model';
import { niceTicks, renderReportPdf } from '../../app/lib/business-studio/report-pdf';
import { renderReportXlsx } from '../../app/lib/business-studio/report-xlsx';
import { richModel } from './fixtures';

const fontDir = join(process.cwd(), 'public', 'fonts', 'amiri');
const fonts = {
  regular: readFileSync(join(fontDir, 'Amiri-Regular.ttf')).toString('base64'),
  bold: readFileSync(join(fontDir, 'Amiri-Bold.ttf')).toString('base64'),
};

function setup() {
  const model = richModel(5);
  model.profile.company.name = 'Société Test SARL';
  model.risks = [newRisk({ title: 'Retard fournisseur', likelihood: 3, impact: 4, mitigation: 'Double sourcing' })];
  model.swot.strengths = ['Emplacement'];
  model.pestel.economic = ['Inflation'];
  const result = computeStudy(model);
  const metrics = computeMetrics(model, result);
  return { model, result, metrics };
}

test('every report type builds in French and Arabic with content', () => {
  const { model, result, metrics } = setup();
  for (const type of REPORT_TYPES) {
    for (const lang of ['fr', 'ar'] as const) {
      const r = buildReport({ type, lang, model, result, metrics, studyName: 'Étude test' });
      assert.ok(r.sections.length >= 2, `${type}/${lang} sections`);
      assert.ok(r.title.length > 0);
      assert.ok(r.checksOk);
      for (const s of r.sections) assert.ok(s.blocks.length > 0, `${type}/${lang}/${s.id} has blocks`);
    }
  }
});

test('a self-approved study is never labelled as independently validated in reports', () => {
  const { model, result, metrics } = setup();
  const cover = (status: string, lang: 'fr' | 'ar') => buildReport({ type: 'bank', lang, model, result, metrics, studyName: 'x', status }).cover;
  const statusRow = (rows: Array<[string, string]>) => rows.find(([k]) => k === 'Statut' || k === 'الحالة')?.[1] ?? '';
  assert.match(statusRow(cover('approved_self', 'fr')), /auto-validation, non indépendante/);
  assert.match(statusRow(cover('approved_self', 'ar')), /غير مستقل/);
  assert.match(statusRow(cover('approved_independent', 'fr')), /validation indépendante/);
  assert.doesNotMatch(statusRow(cover('approved_self', 'fr')), /\(validation indépendante\)/);
});

test('dashboard structure charts are the same blocks as the full report charts', () => {
  const { model, result, metrics } = setup();
  for (const lang of ['fr', 'ar'] as const) {
    const report = buildReport({ type: 'full', lang, model, result, metrics, studyName: 'x' });
    const inReport = report.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'chart' && (b.type === 'donut' || b.type === 'pyramid'));
    const dashboard = structureCharts(model, result, metrics, lang);
    assert.ok(dashboard.some((b) => b.type === 'pyramid') && dashboard.filter((b) => b.type === 'donut').length >= 3);
    for (const b of dashboard) {
      const match = inReport.find((c) => c.kind === 'chart' && c.title === b.title);
      assert.ok(match, `${lang}: ${b.title} in report`);
      assert.deepEqual(match.kind === 'chart' && match.series, b.series);
    }
  }
});

test('report statement values reconcile with the engine and the metrics', () => {
  const { model, result, metrics } = setup();
  const r = buildReport({ type: 'financials', lang: 'fr', model, result, metrics, studyName: 'x' });
  const cpc = r.sections.find((s) => s.id === 'st-cpc')?.blocks.find((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table');
  assert.ok(cpc);
  const net = cpc.rows.find((row) => row.label === 'Résultat net');
  assert.ok(net, 'net income row');
  metrics.years.forEach((y, i) => {
    const c = net.cells[i];
    assert.ok('v' in c);
    assert.equal(c.v, y.netIncome, `net income ${y.label}`);
  });
  const ca = cpc.rows.find((row) => row.label === 'Chiffre d’affaires net');
  assert.ok(ca, 'revenue row');
  metrics.years.forEach((y, i) => assert.equal((ca.cells[i] as { v: number }).v, y.revenue));
});

test('charts carry engine series only', () => {
  const { model, result, metrics } = setup();
  const r = buildReport({ type: 'full', lang: 'fr', model, result, metrics, studyName: 'x' });
  const charts = r.sections.flatMap((s) => s.blocks).filter((b): b is Extract<Block, { kind: 'chart' }> => b.kind === 'chart');
  assert.ok(charts.length >= 2);
  const cash = charts.find((c) => c.type === 'line');
  assert.deepEqual(cash?.series[0].values, result.monthly.cash);
  const bars = charts.find((c) => c.type === 'bar');
  assert.deepEqual(bars?.series[0].values, metrics.years.map((y) => y.revenue));
  // Structure charts use the first complete fiscal year.
  const ref = result.calendar.fiscalYears.find((f) => !f.partial) ?? result.calendar.fiscalYears[0];
  const fy = (s: number[]) => s.slice(ref.firstMonth, ref.lastMonth + 1).reduce((a, b) => a + b, 0);
  const pyramid = charts.find((c) => c.type === 'pyramid');
  assert.ok(pyramid, 'SIG pyramid');
  assert.equal(pyramid.series[0].values[0], fy(result.monthly.revenue));
  assert.equal(pyramid.series[0].values[3], fy(result.monthly.ebitda));
  assert.equal(pyramid.series[0].values[pyramid.series[0].values.length - 1], fy(result.monthly.netIncome));
  const donuts = charts.filter((c) => c.type === 'donut');
  assert.ok(donuts.length >= 2, 'financing and cost donuts');
  const financing = donuts.find((c) => c.labels.includes('Emprunts'));
  assert.ok(financing);
  assert.equal(financing.series[0].values[financing.labels.indexOf('Emprunts')], result.monthly.cashInLoans.reduce((a, b) => a + b, 0));
  for (const d of donuts) for (const v of d.series[0].values) assert.ok(v > 0 && Number.isSafeInteger(v), `${d.title}: positive integer centimes`);
});

test('executive summary and cover are built from computed values, with a translated status', () => {
  const { model, result, metrics } = setup();
  for (const lang of ['fr', 'ar'] as const) {
    const r = buildReport({ type: 'bank', lang, model, result, metrics, studyName: 'x', status: 'draft' });
    assert.equal(r.sections[0].id, 'summary');
    assert.equal(r.status, lang === 'fr' ? 'Brouillon' : 'مسودة');
    const cover = new Map(r.cover);
    assert.ok([...cover.values()].some((v) => v.includes(formatCentsMad(metrics.totals.capex, lang))), `${lang} cover investment`);
    const items = r.sections[0].blocks.flatMap((b) => (b.kind === 'list' ? b.items : [])).join(' ');
    assert.ok(items.includes(formatCentsMad(metrics.totals.netIncome, lang)), `${lang} summary net income`);
    assert.equal(r.horizon.fiscalYears.length, result.calendar.fiscalYears.length);
  }
});

test('chart axis ticks are round values covering the data', () => {
  assert.deepEqual(niceTicks(0, 2497), [0, 1000, 2000, 3000]);
  assert.deepEqual(niceTicks(-33, 1436), [-500, 0, 500, 1000, 1500]);
  for (const [lo, hi] of [[0, 1], [-7.3, 0], [0, 123456789], [-1e6, 3.2e6]]) {
    const t = niceTicks(lo, hi);
    assert.ok(t[0] <= lo && t[t.length - 1] >= hi && t.includes(0), `${lo}..${hi}: ${t}`);
    assert.ok(t.length <= 8, `${lo}..${hi}: ${t.length} ticks`);
  }
});

test('Excel export writes engine values in MAD with RTL for Arabic', async () => {
  const { model, result, metrics } = setup();
  for (const lang of ['fr', 'ar'] as const) {
    const report = buildReport({ type: 'financials', lang, model, result, metrics, studyName: 'Étude test' });
    const buf = await renderReportXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    // Cover, contents, one sheet per section, then the cross-sheet controls.
    assert.equal(wb.worksheets.length, report.sections.length + 3);
    const controls = wb.worksheets[wb.worksheets.length - 1];
    const formulas: string[] = [];
    controls.eachRow((row) => row.eachCell((cell) => { const v = cell.value as { formula?: string } | null; if (v && typeof v === 'object' && v.formula) formulas.push(v.formula); }));
    assert.ok(formulas.some((f) => f.includes('!')), `${lang} controls reference statement sheets`);
    assert.ok(formulas.some((f) => f.startsWith('IF(AND(')), `${lang} controls carry a status formula`);
    const ws = wb.worksheets[2];
    assert.equal(ws.views[0]?.rightToLeft ?? false, lang === 'ar');
    const values: number[] = [];
    ws.eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === 'number') values.push(cell.value); }));
    for (const y of metrics.years) {
      assert.ok(values.some((v) => Math.abs(v - y.netIncome / 100) < 1e-9), `${lang} net income ${y.label} present`);
      assert.ok(values.some((v) => Math.abs(v - y.revenue / 100) < 1e-9), `${lang} revenue ${y.label} present`);
    }
    assert.match(String(ws.headerFooter.oddFooter), /&P \/ &N/);
  }
});

test('PDF export renders every report type, Arabic requires the embedded font', () => {
  const { model, result, metrics } = setup();
  const N = result.calendar.months;
  const actuals = aggregateActuals([{ date: `${result.calendar.labels[1]}-15`, account: '7111', debit: 0, credit: 1000, status: 'validated' }], result.calendar.labels);
  for (const type of REPORT_TYPES) {
    for (const lang of ['fr', 'ar'] as const) {
      const report = buildReport({ type, lang, model, result, metrics, studyName: 'Étude test', actuals: type === 'actuals' ? actuals : null });
      const pdf = Buffer.from(renderReportPdf(report, fonts));
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', `${type}/${lang}`);
      const pages = (pdf.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;
      assert.ok(pages >= 3, `${type}/${lang} has cover, contents and sections (${pages} pages)`);
    }
  }
  assert.ok(N > 0);
  const ar = buildReport({ type: 'tax', lang: 'ar', model, result, metrics, studyName: 'x' });
  assert.throws(() => renderReportPdf(ar), /arabic_font_required/);
  const fr = buildReport({ type: 'tax', lang: 'fr', model, result, metrics, studyName: 'x' });
  assert.equal(Buffer.from(renderReportPdf(fr)).subarray(0, 5).toString(), '%PDF-');
});

test('number formatting keeps digit order safe for Arabic', () => {
  assert.equal(formatNumber(1250000, 'ar'), '1,250,000');
  assert.equal(formatNumber(-1250000.5, 'ar', 1), '-1,250,000.5');
  assert.equal(formatNumber(1250000, 'fr'), '1\u00a0250\u00a0000');
  assert.equal(formatCentsMad(123456789, 'fr', 2), '1\u00a0234\u00a0567,89');
  assert.equal(monthLabel('2026-03', 'ar'), '2026/03');
  assert.equal(formatCell({ v: null, u: 'mad', reason: 'CA nul.' }, 'fr'), 'n.d. (CA nul.)');
  assert.equal(formatCell({ v: 12.345, u: 'pct' }, 'fr'), '12,3 %');
});
