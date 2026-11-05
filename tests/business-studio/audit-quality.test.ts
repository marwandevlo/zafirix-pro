import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { findings } from '../../app/lib/business-studio/analysis';
import { computeStudy } from '../../app/lib/business-studio/engine';
import { computeMetrics } from '../../app/lib/business-studio/metrics';
import {
  emptyModel, newExpense, newInvestment, newLoan, newProduct, validateStudyModel, type StudyModel,
} from '../../app/lib/business-studio/model';
import { buildReport } from '../../app/lib/business-studio/report-model';
import { renderReportDocx } from '../../app/lib/business-studio/report-docx';
import { renderReportPdf } from '../../app/lib/business-studio/report-pdf';
import { renderReportXlsx } from '../../app/lib/business-studio/report-xlsx';

/**
 * Numeric clone of the stored November 2026 real-estate draft. No name, identifier or narrative beyond the
 * financing sentence that the importer keeps. The subscription formula is locked, not rewritten.
 */
function referenceModel(): StudyModel {
  const m = emptyModel({ startMonth: '2026-11', years: 7, sector: 'real_estate', projectType: 'existing' });
  m.horizon.fiscalYearStartMonth = 12;
  m.profile.company.name = 'Cas de référence';
  m.profile.project.objectives = 'Financement recherché : pret bancaire classique';
  m.products = [newProduct({
    id: 'p1', name: 'Chiffre d’affaires mensuel', kind: 'subscription',
    unitPrice: 2_000_000, priceGrowthPct: 15, unitCost: 2_000_000, volumeMonth1: 1, volumeGrowthPct: [20],
    churnPctMonthly: 15, unitCostGrowthPct: 20, capacityPerMonth: 2_000_000,
  })];
  m.expenses = [
    newExpense({ id: 'rent', name: 'Loyer', behavior: 'variable_revenue_pct', amountMonthly: 76_987, pctOfRevenue: 0, growthPct: 15 }),
    newExpense({ id: 'ext', name: 'Charges externes', amountMonthly: 2_000_000, growthPct: 15 }),
  ];
  m.investments = [newInvestment({ id: 'i1', name: 'Travaux', amountHT: 0 })];
  m.financing.equity = [{ id: 'q1', name: 'Capital', amount: 500_000, month: 0 }];
  m.financing.grants = [{ id: 'g1', name: 'Subvention', kind: 'investment', amount: 2_000_000, month: 0, amortizationYears: 7 }];
  m.financing.leases = [{
    id: 'z1', name: 'Contrat', monthlyRentHT: 7_000, vatRatePct: 20, startMonth: 0, termMonths: 36,
    purchaseOptionHT: 2_000_000, optionAssetLifeYears: 5,
  }];
  m.financing.overdraftRatePct = 15;
  m.tax.applyMinimumContributionExemption = true;
  return m;
}

test('stored subscription assumptions still produce the audited revenue, without a contractual DSCR', () => {
  const model = referenceModel();
  const validated = validateStudyModel(model);
  assert.equal(validated.issues.some((i) => i.severity === 'error'), false);
  assert.ok(validated.issues.some((i) => i.path === 'products.p1.kind'));
  assert.ok(validated.issues.some((i) => i.path === 'expenses.rent.amountMonthly'));
  assert.ok(validated.issues.some((i) => i.path === 'financing.loans'));
  const result = computeStudy(validated.model);
  assert.equal(result.checks.ok, true);
  const metrics = computeMetrics(validated.model, result);
  const y2027 = metrics.years.find((y) => y.label === '2026/27');
  const y2032 = metrics.years.find((y) => y.label === '2031/32');
  assert.ok(y2027 && y2032);
  assert.equal(Math.round(y2027.revenue / 100), 107_131_049);
  assert.equal(Math.round(y2032.revenue / 100), 760_731_838);
  assert.equal(y2027.partial, false);
  assert.equal(metrics.years[0].label, '2025/26');
  assert.equal(metrics.years[0].partial, true);
  assert.equal(Math.round(y2027.incomeTax / 100), 0);
  assert.equal(Math.round(metrics.years.find((y) => y.label === '2029/30')!.incomeTax / 100), 998_881);
  assert.equal(y2027.dscr.value, null);
  assert.equal(metrics.saas, null);
  assert.ok((metrics.peakFundingNeed.value ?? 0) > 0);
  assert.ok((metrics.minCash.value ?? 0) < -(metrics.peakFundingNeed.value ?? 0));
  const notes = findings(validated.model, result, metrics, 'fr').map((f) => f.id);
  for (const id of ['subscription-p1', 'expense-ignored-rent', 'loan-text-only', 'overdraft-not-dscr', 'real-estate-staff', 'real-estate-works', 'price-p1']) {
    assert.ok(notes.includes(id), id);
  }
});

test('a contractual loan still has a finite DSCR, and SaaS metrics stay on the SaaS sector', () => {
  const model = emptyModel({ startMonth: '2026-01', years: 2, sector: 'saas' });
  model.products = [newProduct({ kind: 'subscription', unitPrice: 200, volumeMonth1: 40, unitCost: 20, churnPctMonthly: 2 })];
  model.financing.equity = [{ id: 'q', name: 'Capital', amount: 50_000, month: 0 }];
  model.financing.loans = [newLoan({ principal: 80_000, annualRatePct: 6, termMonths: 24 })];
  model.financing.overdraftRatePct = 15;
  const result = computeStudy(model);
  const metrics = computeMetrics(model, result);
  const withDebt = metrics.years.filter((y) => y.debtService > 0);
  assert.ok(withDebt.length > 0);
  assert.ok(withDebt.every((y) => y.dscr.value != null && Number.isFinite(y.dscr.value)));
  assert.ok(metrics.saas != null);
  model.sector = 'real_estate';
  assert.equal(computeMetrics(model, result).saas, null);
});

test('PDF, Word and Excel carry the same audited revenue', async () => {
  const model = referenceModel();
  const result = computeStudy(model);
  const metrics = computeMetrics(model, result);
  const report = buildReport({
    type: 'financials', lang: 'fr', model, result, metrics, studyName: 'Cas de référence', status: 'draft', revision: 1,
  });
  const cents = report.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'table').flatMap((b) => b.rows)
    .flatMap((row) => row.cells).filter((c) => 'v' in c && typeof c.v === 'number' && Math.round(c.v / 100) === 107_131_049);
  assert.ok(cents.length >= 1);

  const pdf = Buffer.from(renderReportPdf(report));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = `${join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/')}/`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  const text = pages.join('\n');
  assert.match(text, /107[\s\u202f\u00a0]*131[\s\u202f\u00a0]*049/);
  assert.match(text, /760[\s\u202f\u00a0]*731[\s\u202f\u00a0]*838/);
  assert.doesNotMatch(text, /ARPU|LTV/);
  const yearTokens = ['2025/26', '2026/27', '2027/28', '2028/29', '2029/30', '2030/31', '2031/32', '2032/33'];
  for (const page of pages) {
    let streak = 0;
    for (const token of page.split(/\s+/)) {
      streak = yearTokens.some((year) => token.startsWith(year)) ? streak + 1 : 0;
      assert.ok(streak <= 4, `eight fiscal years stayed on one header: ${token}`);
    }
  }

  const docx = await JSZip.loadAsync(renderReportDocx(report));
  const xml = await docx.file('word/document.xml')!.async('string');
  assert.match(xml, /107[\s\u202f\u00a0]*131[\s\u202f\u00a0]*049/);
  assert.match(xml, /142B55/i);
  assert.match(xml, /w:tblHeader/);

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await renderReportXlsx(report));
  const grid = book.worksheets.flatMap((sheet) => {
    const values: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => {
      const value = cell.value;
      if (typeof value === 'number') values.push(String(Math.round(value)));
      else if (value != null && typeof value === 'object' && 'result' in value && typeof value.result === 'number') values.push(String(Math.round(value.result)));
      else if (value != null && typeof value === 'object' && 'text' in value) values.push(String(value.text ?? ''));
      else values.push(String(value ?? ''));
    }));
    return values;
  }).join('\n');
  assert.match(grid, /107[\s\u202f\u00a0]*131[\s\u202f\u00a0]*049/);
  assert.match(grid, /760[\s\u202f\u00a0]*731[\s\u202f\u00a0]*838/);
});

test('Arabic report keeps the same centimes and shapes the partial-year note', () => {
  const fontDir = join(process.cwd(), 'public', 'fonts', 'amiri');
  const fonts = {
    regular: readFileSync(join(fontDir, 'Amiri-Regular.ttf')).toString('base64'),
    bold: readFileSync(join(fontDir, 'Amiri-Bold.ttf')).toString('base64'),
  };
  const model = referenceModel();
  const result = computeStudy(model);
  const metrics = computeMetrics(model, result);
  const report = buildReport({ type: 'financials', lang: 'ar', model, result, metrics, studyName: 'حالة مرجعية', status: 'draft' });
  const pdf = Buffer.from(renderReportPdf(report, fonts));
  assert.ok(pdf.length > 1000);
  const revenue = report.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'table').flatMap((b) => b.rows)
    .flatMap((row) => row.cells).filter((c) => 'v' in c && typeof c.v === 'number' && Math.round(c.v / 100) === 760_731_838);
  assert.ok(revenue.length >= 1);
});
