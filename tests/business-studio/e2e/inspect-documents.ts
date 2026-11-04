/**
 * Reopens Business Studio PDF and Excel files and checks their content.
 *
 *   npx tsx tests/business-studio/e2e/inspect-documents.ts generate <outDir>        writes reports for the test cases, then inspects them
 *   npx tsx tests/business-studio/e2e/inspect-documents.ts inspect <outDir> <file…>  inspects existing files (e.g. browser downloads)
 *
 * For each PDF: page count, text of every page, rendered page images (<outDir>/png), pages without text or ink,
 * placeholder or broken values. For each workbook: sheets, rows, numeric cells, formulas, broken values.
 * Writes <outDir>/inspection.json and exits non-zero when a check fails.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import ExcelJS from 'exceljs';
import { computeStudy } from '../../../app/lib/business-studio/engine';
import { computeMetrics } from '../../../app/lib/business-studio/metrics';
import { validateStudyModel, type StudyModel } from '../../../app/lib/business-studio/model';
import { buildReport, reportFileName, REPORT_TYPES } from '../../../app/lib/business-studio/report-model';
import { renderReportPdf } from '../../../app/lib/business-studio/report-pdf';
import { renderReportXlsx } from '../../../app/lib/business-studio/report-xlsx';
import { bakeryCase, workshopCase } from '../cases';

const BROKEN = /\b(NaN|undefined|null|Infinity|\[object Object\]|lorem|TODO|XXX|placeholder)\b/i;

type PdfReport = { file: string; pages: number; emptyPages: number[]; brokenPages: Array<{ page: number; match: string }>; textChars: number; images: string[]; arabicGlyphPages: number };
type XlsxReport = { file: string; sheets: Array<{ name: string; rows: number; numbers: number; formulas: number }>; broken: Array<{ sheet: string; cell: string; value: string }> };

async function inspectPdf(file: string, pngDir: string): Promise<PdfReport> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const data = new Uint8Array(readFileSync(file));
  const standardFontDataUrl = `${join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/')}/`;
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
  const out: PdfReport = { file: basename(file), pages: doc.numPages, emptyPages: [], brokenPages: [], textChars: 0, images: [], arabicGlyphPages: 0 };
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
    out.textChars += text.length;
    if (/[\u0600-\u06FF\uFB50-\uFEFF]/.test(text)) out.arabicGlyphPages += 1;
    const m = BROKEN.exec(text);
    if (m) out.brokenPages.push({ page: p, match: text.slice(Math.max(0, m.index - 40), m.index + 40) });
    const viewport = page.getViewport({ scale: 1.3 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < px.length; i += 16) if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) ink += 1;
    const inkPct = (ink / (px.length / 16)) * 100;
    if (text.trim().length < 40 || inkPct < 0.3) out.emptyPages.push(p);
    const png = join(pngDir, `${basename(file, '.pdf')}-p${String(p).padStart(2, '0')}.png`);
    writeFileSync(png, canvas.toBuffer('image/png'));
    out.images.push(png);
  }
  return out;
}

async function inspectXlsx(file: string): Promise<XlsxReport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
  const out: XlsxReport = { file: basename(file), sheets: [], broken: [] };
  wb.eachSheet((ws) => {
    let numbers = 0;
    let formulas = 0;
    ws.eachRow((row) => row.eachCell((cell) => {
      const v = cell.value as unknown;
      if (typeof v === 'number') { numbers += 1; if (!Number.isFinite(v)) out.broken.push({ sheet: ws.name, cell: cell.address, value: String(v) }); }
      else if (v && typeof v === 'object' && 'formula' in (v as object)) formulas += 1;
      else if (typeof v === 'string' && BROKEN.test(v)) out.broken.push({ sheet: ws.name, cell: cell.address, value: v.slice(0, 80) });
    }));
    out.sheets.push({ name: ws.name, rows: ws.rowCount, numbers, formulas });
  });
  return out;
}

function fonts() {
  const dir = join(process.cwd(), 'public', 'fonts', 'amiri');
  return { regular: readFileSync(join(dir, 'Amiri-Regular.ttf')).toString('base64'), bold: readFileSync(join(dir, 'Amiri-Bold.ttf')).toString('base64') };
}

async function generate(outDir: string): Promise<string[]> {
  const files: string[] = [];
  const cases: Array<[string, StudyModel]> = [['Boulangerie Al Baraka', bakeryCase(7)], ['Atelier Métal — extension', workshopCase(10)]];
  for (const [name, raw] of cases) {
    const v = validateStudyModel(raw);
    if (!v.ok) throw new Error(`${name}: ${JSON.stringify(v.issues.filter((i) => i.severity === 'error'))}`);
    const result = computeStudy(v.model);
    const metrics = computeMetrics(v.model, result);
    for (const type of REPORT_TYPES) {
      for (const lang of ['fr', 'ar'] as const) {
        const report = buildReport({ type, lang, model: v.model, result, metrics, studyName: name, revision: 1, status: 'draft' });
        const pdf = join(outDir, reportFileName(report, 'pdf'));
        writeFileSync(pdf, Buffer.from(renderReportPdf(report, lang === 'ar' ? fonts() : undefined)));
        const xlsx = join(outDir, reportFileName(report, 'xlsx'));
        writeFileSync(xlsx, Buffer.from(await renderReportXlsx(report)));
        files.push(pdf, xlsx);
      }
    }
  }
  return files;
}

async function main() {
  const [mode, outDir, ...rest] = process.argv.slice(2);
  if (!outDir || (mode !== 'generate' && mode !== 'inspect')) throw new Error('usage: generate <outDir> | inspect <outDir> <files…>');
  mkdirSync(join(outDir, 'png'), { recursive: true });
  const files = mode === 'generate' ? await generate(outDir) : rest;
  const pdfs: PdfReport[] = [];
  const xlsxs: XlsxReport[] = [];
  for (const f of files) {
    if (f.endsWith('.pdf')) pdfs.push(await inspectPdf(f, join(outDir, 'png')));
    else if (f.endsWith('.xlsx')) xlsxs.push(await inspectXlsx(f));
  }
  writeFileSync(join(outDir, 'inspection.json'), JSON.stringify({ pdfs: pdfs.map(({ images, ...p }) => ({ ...p, images: images.length })), xlsxs }, null, 2));
  let failed = 0;
  for (const p of pdfs) {
    const bad = p.emptyPages.length > 0 || p.brokenPages.length > 0 || (p.file.includes('-ar') && p.arabicGlyphPages === 0);
    if (bad) failed += 1;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${p.file}: ${p.pages} pages, ${p.textChars} chars${p.emptyPages.length ? `, empty pages ${p.emptyPages.join(',')}` : ''}${p.brokenPages.length ? `, broken ${JSON.stringify(p.brokenPages)}` : ''}`);
  }
  for (const x of xlsxs) {
    const bad = x.broken.length > 0 || x.sheets.length === 0 || x.sheets.every((s) => s.numbers === 0);
    if (bad) failed += 1;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${x.file}: ${x.sheets.length} sheets, ${x.sheets.reduce((a, s) => a + s.numbers, 0)} numbers, ${x.sheets.reduce((a, s) => a + s.formulas, 0)} formulas${x.broken.length ? `, broken ${JSON.stringify(x.broken.slice(0, 5))}` : ''}`);
  }
  console.log(`\n${pdfs.length} PDF, ${xlsxs.length} workbooks, ${failed} failing`);
  process.exitCode = failed ? 1 : 0;
}

void main();
