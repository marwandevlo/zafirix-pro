import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { computeStudy } from '../../app/lib/business-studio/engine';
import { formatCentsMad } from '../../app/lib/business-studio/i18n';
import { computeMetrics, firstFullYear } from '../../app/lib/business-studio/metrics';
import { buildReport, reportFileName } from '../../app/lib/business-studio/report-model';
import { renderReportDocx } from '../../app/lib/business-studio/report-docx';
import { renderReportPdf } from '../../app/lib/business-studio/report-pdf';
import { renderReportXlsx } from '../../app/lib/business-studio/report-xlsx';
import { richModel } from './fixtures';

const fontDir = join(process.cwd(), 'public', 'fonts', 'amiri');
const fonts = {
  regular: readFileSync(join(fontDir, 'Amiri-Regular.ttf')).toString('base64'),
  bold: readFileSync(join(fontDir, 'Amiri-Bold.ttf')).toString('base64'),
};

const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
));

function setup() {
  const model = richModel(5);
  model.profile.company.name = 'Société Test SARL';
  const result = computeStudy(model);
  const metrics = computeMetrics(model, result);
  return { model, result, metrics };
}

test('Word export is a real docx of the complete study, with the same figures as the engine', async () => {
  const { model, result, metrics } = setup();
  for (const lang of ['fr', 'ar'] as const) {
    const report = buildReport({ type: 'full', lang, model, result, metrics, studyName: 'Étude test', status: 'draft', revision: 3 });
    const chart = report.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'chart');
    assert.ok(chart && chart.kind === 'chart');
    const bytes = await renderReportDocx(report, new Map([[chart.title, PNG]]));
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.notEqual(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
    assert.ok(bytes.byteLength > 8000, `${lang} docx too small`);
    const name = reportFileName(report, 'docx');
    assert.match(name, /\.docx$/);
    assert.doesNotMatch(name, /\.pdf$/);

    const zip = await JSZip.loadAsync(bytes);
    const types = await zip.file('[Content_Types].xml')!.async('string');
    assert.match(types, /wordprocessingml\.document/);
    assert.ok(zip.file('word/document.xml'));
    assert.ok(Object.keys(zip.files).some((f) => f.startsWith('word/media/')));
    const xml = await zip.file('word/document.xml')!.async('string');
    assert.match(xml, /Société Test SARL/);
    assert.match(xml, lang === 'ar' ? /مسودة/ : /BROUILLON/);
    const year = firstFullYear(metrics)!;
    const revenue = formatCentsMad(year.revenue, lang).replace(/\s/g, '');
    assert.ok(xml.replace(/\s/g, '').includes(revenue), `${lang} docx missing revenue ${revenue}`);
    assert.match(xml, new RegExp(chart.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 24)));
  }
});

test('a draft PDF and workbook carry the draft label and the same revenue', async () => {
  const { model, result, metrics } = setup();
  const report = buildReport({ type: 'full', lang: 'fr', model, result, metrics, studyName: 'Étude test', status: 'draft' });
  const pdf = Buffer.from(renderReportPdf(report, fonts));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.byteLength > 20000);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await renderReportXlsx(report));
  const cover = book.getWorksheet('Couverture');
  assert.equal(cover?.getCell('A2').value, 'BROUILLON — étude non validée');
  const year = firstFullYear(metrics)!;
  const flat = JSON.stringify(book.worksheets.map((ws) => ws.getSheetValues())).replace(/\s/g, '');
  assert.ok(flat.includes(String(year.revenue / 100)), 'workbook missing the engine revenue');
});
