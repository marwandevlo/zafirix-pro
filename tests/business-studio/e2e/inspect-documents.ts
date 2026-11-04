/**
 * Reopens Business Studio PDF and Excel files and checks their content.
 *
 *   npx tsx tests/business-studio/e2e/inspect-documents.ts generate <outDir>        writes reports for the test cases, then inspects them
 *   npx tsx tests/business-studio/e2e/inspect-documents.ts inspect <outDir> <file…>  inspects existing files (e.g. browser downloads)
 *     options: --company=<name> --status=<French status> --status-ar=<Arabic status> --years=<fy,fy,…>
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

type PdfReport = { file: string; pages: number; emptyPages: number[]; brokenPages: Array<{ page: number; match: string }>; textChars: number; images: string[]; arabicGlyphPages: number; missing: string[] };
type XlsxReport = { file: string; sheets: Array<{ name: string; rows: number; numbers: number; formulas: number }>; broken: Array<{ sheet: string; cell: string; value: string }> };

async function inspectPdf(file: string, pngDir: string, expect?: Expect): Promise<PdfReport> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const data = new Uint8Array(readFileSync(file));
  const standardFontDataUrl = `${join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/')}/`;
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
  const out: PdfReport = { file: basename(file), pages: doc.numPages, emptyPages: [], brokenPages: [], textChars: 0, images: [], arabicGlyphPages: 0, missing: [] };
  const all: string[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const items = (await page.getTextContent()).items;
    const text = items.map((i) => ('str' in i ? i.str : '')).join(' ');
    all.push(text);
    // A right-to-left line whose logical text starts with closing punctuation was reordered as a left-to-right paragraph.
    for (const i of items) if ('str' in i && i.dir === 'rtl' && /^[.،؛:%]/.test(i.str.trim())) out.brokenPages.push({ page: p, match: `bidi: ${i.str.slice(0, 60)}` });
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
  // pdf.js returns Arabic runs in visual order, so the Arabic status label is only checked in the workbook.
  if (expect) out.missing = missing(all.join(' '), file.includes('-ar') ? { ...expect, status: '' } : expect);
  return out;
}

type Formula = { formula: string; result?: unknown };
const isFormula = (v: unknown): v is Formula => Boolean(v && typeof v === 'object' && 'formula' in (v as object));

/**
 * Independent evaluator for the formula shapes the workbook writes: signed sums of (cross-sheet) cell references,
 * ROUND(…,2), SUM(range), share IF($B$n=0,0,Bk/$B$n) and the OK/ÉCART status test. Anything else is reported.
 */
function evaluate(wb: ExcelJS.Workbook, sheet: string, f: string): number | string | null {
  const num = (sh: string, ref: string): number => {
    const v = wb.getWorksheet(sh)?.getCell(ref.replace(/\$/g, '')).value as unknown;
    if (typeof v === 'number') return v;
    if (isFormula(v)) { const r = evaluate(wb, sh, v.formula); return typeof r === 'number' ? r : NaN; }
    return NaN;
  };
  const range = (r: string): number[] => {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(r.replace(/\$/g, ''));
    if (!m) return [NaN];
    const col = (s: string) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
    const out: number[] = [];
    for (let c = col(m[1]); c <= col(m[3]); c += 1) for (let rr = Number(m[2]); rr <= Number(m[4]); rr += 1) {
      let s = ''; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
      out.push(num(sheet, `${s}${rr}`));
    }
    return out;
  };
  const linear = (expr: string): number | null => {
    const re = /([+-]?)(?:'((?:[^']|'')+)'!)?(\$?[A-Z]+\$?\d+)/gy;
    let total = 0; let pos = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(expr))) { total += (m[1] === '-' ? -1 : 1) * num(m[2] ? m[2].replace(/''/g, "'") : sheet, m[3]); pos = re.lastIndex; }
    return pos === expr.length && pos > 0 ? total : null;
  };
  let m: RegExpExecArray | null;
  if ((m = /^ROUND\((.+),2\)$/.exec(f))) { const v = linear(m[1]); return v == null ? null : Math.round(v * 100) / 100; }
  if ((m = /^SUM\(([A-Z$0-9:]+)\)$/.exec(f))) return range(m[1]).reduce((a, b) => a + b, 0);
  if ((m = /^IF\(\$B\$(\d+)=0,0,B(\d+)\/\$B\$\1\)$/.exec(f))) { const t = num(sheet, `B${m[1]}`); return t === 0 ? 0 : num(sheet, `B${m[2]}`) / t; }
  if ((m = /^IF\(AND\(MAX\(([A-Z0-9:]+)\)<0\.005,MIN\(\1\)>-0\.005\),"OK","([^"]+)"\)$/.exec(f))) {
    const v = range(m[1]); return Math.max(...v) < 0.005 && Math.min(...v) > -0.005 ? 'OK' : m[2];
  }
  return linear(f);
}

async function inspectXlsx(file: string, expect?: Expect): Promise<XlsxReport> {
  const wb = new ExcelJS.Workbook();
  const buf = readFileSync(file);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  // exceljs reads a cached formula result of 0 as undefined; SheetJS reads the stored <v> as is.
  const XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
  const sj = XLSX.read(buf, { type: 'buffer', cellFormula: true });
  const cachedOf = (sheet: string, addr: string): unknown => sj.Sheets[sheet]?.[addr]?.v;
  const out: XlsxReport = { file: basename(file), sheets: [], broken: [] };
  const allText: string[] = [];
  const calcPr = (sj.Workbook as { CalcPr?: Record<string, unknown> } | undefined)?.CalcPr;
  if (!calcPr || String(calcPr.fullCalcOnLoad) !== '1') {
    out.broken.push({ sheet: '*', cell: '*', value: 'workbook does not request full recalculation on load' });
  }
  wb.eachSheet((ws) => {
    let numbers = 0;
    let formulas = 0;
    ws.eachRow((row) => row.eachCell((cell) => {
      const v = cell.value as unknown;
      if (typeof v === 'number') { numbers += 1; if (!Number.isFinite(v)) out.broken.push({ sheet: ws.name, cell: cell.address, value: String(v) }); }
      else if (isFormula(v)) {
        formulas += 1;
        const got = evaluate(wb, ws.name, v.formula);
        const cached = cachedOf(ws.name, cell.address);
        const okNum = typeof got === 'number' && typeof cached === 'number' && Number.isFinite(got) && Math.abs(got - cached) < 0.005;
        const okStr = typeof got === 'string' && got === cached;
        if (!okNum && !okStr) out.broken.push({ sheet: ws.name, cell: cell.address, value: `formula ${v.formula} evaluates to ${String(got)}, cached ${String(cached)}` });
        if (typeof cached === 'string' && cached !== 'OK') out.broken.push({ sheet: ws.name, cell: cell.address, value: `control ${cached}` });
      } else if (typeof v === 'string') {
        allText.push(v);
        if (BROKEN.test(v)) out.broken.push({ sheet: ws.name, cell: cell.address, value: v.slice(0, 80) });
      } else if (v && typeof v === 'object' && 'text' in (v as object)) allText.push(String((v as { text: unknown }).text));
    }));
    out.sheets.push({ name: ws.name, rows: ws.rowCount, numbers, formulas });
  });
  if (expect) for (const miss of missing(allText.join(' '), expect)) out.broken.push({ sheet: '*', cell: '*', value: `missing ${miss}` });
  return out;
}

/** Content every document must carry: company identity, translated status, and every fiscal year of the horizon when statements are included. */
type Expect = { company: string; status: string; fiscalYears: string[] };
function missing(text: string, e: Expect): string[] {
  const out: string[] = [];
  if (!text.includes(e.company)) out.push(`company "${e.company}"`);
  if (!text.includes(e.status)) out.push(`status "${e.status}"`);
  if (/\bdraft\b/.test(text)) out.push('untranslated status code "draft"');
  for (const fy of e.fiscalYears) if (!text.includes(fy)) out.push(`fiscal year ${fy}`);
  return out;
}

function fonts() {
  const dir = join(process.cwd(), 'public', 'fonts', 'amiri');
  return { regular: readFileSync(join(dir, 'Amiri-Regular.ttf')).toString('base64'), bold: readFileSync(join(dir, 'Amiri-Bold.ttf')).toString('base64') };
}

const YEARLY_TYPES = new Set(['full', 'bank', 'investor', 'financials', 'tax']);
const expectations = new Map<string, Expect>();

async function generate(outDir: string): Promise<string[]> {
  const files: string[] = [];
  const cases: Array<[string, StudyModel]> = [
    ['Boulangerie Al Baraka', bakeryCase(7)], ['Atelier Métal — extension', workshopCase(10)],
    ['Boulangerie Al Baraka 3 ans', bakeryCase(3, '2026-12')], ['Boulangerie Al Baraka 30 ans', bakeryCase(30, '2026-12')],
    ['Atelier Métal 15 ans', workshopCase(15, '2026-07')], ['Atelier Métal 20 ans', workshopCase(20)],
  ];
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
        const e: Expect = { company: v.model.profile.company.name, status: report.status, fiscalYears: YEARLY_TYPES.has(type) ? report.horizon.fiscalYears : [] };
        expectations.set(pdf, e);
        expectations.set(xlsx, e);
      }
    }
  }
  return files;
}

async function main() {
  const [mode, outDir, ...rest] = process.argv.slice(2);
  if (!outDir || (mode !== 'generate' && mode !== 'inspect')) throw new Error('usage: generate <outDir> | inspect <outDir> <files…>');
  mkdirSync(join(outDir, 'png'), { recursive: true });
  const opt = (k: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const files = mode === 'generate' ? await generate(outDir) : rest.filter((a) => !a.startsWith('--'));
  if (mode === 'inspect' && opt('company')) {
    const e: Expect = { company: opt('company')!, status: opt('status') ?? '', fiscalYears: (opt('years') ?? '').split(',').filter(Boolean) };
    for (const f of files) {
      const lang = /-ar\.(pdf|xlsx)$/.test(f) ? { ...e, status: opt('status-ar') ?? '' } : e;
      expectations.set(f, /-(scenarios|actuals)-/.test(f) ? { ...lang, fiscalYears: [] } : lang);
    }
  }
  const pdfs: PdfReport[] = [];
  const xlsxs: XlsxReport[] = [];
  for (const f of files) {
    if (f.endsWith('.pdf')) pdfs.push(await inspectPdf(f, join(outDir, 'png'), expectations.get(f)));
    else if (f.endsWith('.xlsx')) xlsxs.push(await inspectXlsx(f, expectations.get(f)));
  }
  writeFileSync(join(outDir, 'inspection.json'), JSON.stringify({ pdfs: pdfs.map(({ images, ...p }) => ({ ...p, images: images.length })), xlsxs }, null, 2));
  let failed = 0;
  for (const p of pdfs) {
    const bad = p.emptyPages.length > 0 || p.brokenPages.length > 0 || p.missing.length > 0 || (p.file.includes('-ar') && p.arabicGlyphPages === 0);
    if (bad) failed += 1;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${p.file}: ${p.pages} pages, ${p.textChars} chars${p.emptyPages.length ? `, empty pages ${p.emptyPages.join(',')}` : ''}${p.brokenPages.length ? `, broken ${JSON.stringify(p.brokenPages)}` : ''}${p.missing.length ? `, missing ${p.missing.join('; ')}` : ''}`);
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
