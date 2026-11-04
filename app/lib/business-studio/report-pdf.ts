/**
 * PDF rendering of a Business Studio report: cover page, table of contents with page numbers, sections, vector
 * charts drawn from the report's series, and "page x / n" footers. Arabic reports are laid out right-to-left and
 * need the Amiri font (public/fonts/amiri, SIL Open Font License) passed in `fonts`.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber, STR } from './i18n';
import { formatCell, type Block, type Report } from './report-model';

export type PdfFonts = { regular: string; bold?: string };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_PERIOD_COLUMNS = 7;
const NAVY: [number, number, number] = [27, 42, 74];
const SERIES_COLORS: Array<[number, number, number]> = [[27, 42, 74], [217, 119, 6], [5, 150, 105], [190, 24, 93], [37, 99, 235]];

/** Characters missing from the standard WinAnsi fonts, used only when no embedded font is available. */
function winAnsiSafe(s: string): string {
  return s.replace(/\u2212/g, '-').replace(/Σ/g, 'Somme ').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/\u202f/g, ' ').replace(/[^\x20-\x7E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC\u2022]/g, '?');
}

export function renderReportPdf(report: Report, fonts?: PdfFonts): ArrayBuffer {
  const rtl = report.lang === 'ar';
  if (rtl && !fonts) throw new Error('arabic_font_required');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let font = 'helvetica';
  if (fonts) {
    doc.addFileToVFS('Amiri-Regular.ttf', fonts.regular);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.addFileToVFS('Amiri-Bold.ttf', fonts.bold ?? fonts.regular);
    doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
    font = 'Amiri';
  }
  // jsPDF's bidi pass misplaces brackets inside Arabic runs, so bracketed asides become dash-separated.
  const arabicSafe = (s: string) => (/[\u0600-\u06FF]/.test(s) ? s.replace(/\s*\(([^()]*)\)/g, ' — $1') : s);
  const T = (s: string) => (fonts ? (rtl ? arabicSafe(s) : s) : winAnsiSafe(s));
  const numbered = (n: number, title: string, x: number, yy: number) => {
    if (!rtl) { doc.text(T(`${n}. ${title}`), x, yy); return; }
    const num = `${n}`;
    doc.text(num, x, yy, { align: 'right' });
    doc.text(T(title), x - doc.getTextWidth(num) - 3, yy, { align: 'right' });
  };
  const setFont = (style: 'normal' | 'bold', size: number) => { doc.setFont(font, style); doc.setFontSize(size); };
  const xStart = rtl ? PAGE_W - MARGIN : MARGIN;
  const align = rtl ? 'right' : 'left';
  let y = MARGIN;

  const newPage = () => { doc.addPage(); y = MARGIN + 4; };
  const ensure = (h: number) => { if (y + h > PAGE_H - 18) newPage(); };
  const writeLines = (text: string, size: number, style: 'normal' | 'bold' = 'normal', color: [number, number, number] = [30, 41, 59]) => {
    setFont(style, size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(T(text), CONTENT_W) as string[];
    const lh = size * 0.42;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, xStart, y, { align });
      y += lh;
    }
    doc.setTextColor(30, 41, 59);
  };

  // Cover
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 70, 'F');
  if (report.logoDataUrl.startsWith('data:image/')) {
    try {
      const fmt = report.logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(report.logoDataUrl, fmt, rtl ? MARGIN : PAGE_W - MARGIN - 30, 12, 30, 30, undefined, 'FAST');
    } catch { /* unreadable logo: cover without it */ }
  }
  doc.setTextColor(255, 255, 255);
  setFont('bold', 22);
  doc.text(doc.splitTextToSize(T(report.title), CONTENT_W - 40) as string[], xStart, 30, { align });
  setFont('normal', 13);
  doc.text(T(report.studyName), xStart, 55, { align });
  doc.setTextColor(30, 41, 59);
  y = 90;
  const coverRows: Array<[string, string]> = [
    [STR.company[report.lang], report.companyName || '—'],
    [STR.sector[report.lang], report.sector],
    [STR.projectType[report.lang], report.projectType],
    [STR.scenario[report.lang], report.scenarioName],
    [STR.status[report.lang], report.status || '—'],
    [STR.revision[report.lang], report.revision == null ? '—' : String(report.revision)],
    [STR.generatedOn[report.lang], report.generatedAt.slice(0, 10).replace(/-/g, '/')],
    [STR.engine[report.lang], report.engineVersion],
    [STR.rules[report.lang], report.rulesVersion],
  ];
  for (const [k, v] of coverRows) {
    setFont('bold', 11);
    doc.text(T(k), xStart, y, { align });
    setFont('normal', 11);
    doc.text(T(v), rtl ? xStart - 60 : xStart + 60, y, { align });
    y += 8;
  }
  y += 4;
  doc.setFillColor(...(report.checksOk ? [220, 252, 231] as [number, number, number] : [254, 226, 226] as [number, number, number]));
  doc.rect(MARGIN, y - 5, CONTENT_W, 10, 'F');
  setFont('bold', 10);
  doc.text(T(report.checksOk ? STR.checksOk[report.lang] : STR.checksKo[report.lang]), xStart + (rtl ? -3 : 3), y + 1.5, { align });
  y = 230;
  for (const d of report.disclaimers) writeLines(d, 9, 'normal', [71, 85, 105]);

  // Table of contents placeholder (page 2), filled once section pages are known.
  doc.addPage();
  const tocPage = 2;
  const sectionPages: number[] = [];

  for (const [si, section] of report.sections.entries()) {
    newPage();
    sectionPages.push(doc.getNumberOfPages());
    setFont('bold', 15);
    doc.setTextColor(...NAVY);
    numbered(si + 1, section.title, xStart, y);
    doc.setDrawColor(...NAVY);
    doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
    doc.setTextColor(30, 41, 59);
    y += 10;
    for (const b of section.blocks) renderBlock(b);
  }

  function renderBlock(b: Block) {
    switch (b.kind) {
      case 'paragraph':
        writeLines(b.text, 9.5);
        y += 2;
        return;
      case 'notice': {
        const color: [number, number, number] = b.tone === 'critical' ? [185, 28, 28] : b.tone === 'warning' ? [146, 64, 14] : [71, 85, 105];
        writeLines(b.text, 8.5, 'normal', color);
        y += 2;
        return;
      }
      case 'list':
        if (b.title) writeLines(b.title, 10, 'bold');
        for (const item of b.items) writeLines(`• ${item}`, 9);
        y += 2;
        return;
      case 'kv': {
        const body = b.rows.map((r) => [T(r.label), T(formatCell(r.cell, report.lang)), T(r.note ?? '')]);
        table([], body, [0.42, 0.22, 0.36]);
        return;
      }
      case 'table': {
        if (b.title) { ensure(10); writeLines(b.title, 10.5, 'bold'); y += 1; }
        const periodCols = b.head.length - 1;
        const chunks = periodCols > MAX_PERIOD_COLUMNS + 1 ? Math.ceil(periodCols / MAX_PERIOD_COLUMNS) : 1;
        for (let c = 0; c < chunks; c += 1) {
          const from = chunks === 1 ? 0 : c * MAX_PERIOD_COLUMNS;
          const to = chunks === 1 ? periodCols : Math.min(periodCols, from + MAX_PERIOD_COLUMNS);
          const head = [b.head[0], ...b.head.slice(1 + from, 1 + to)].map(T);
          const body = b.rows.map((r) => [T(r.label), ...r.cells.slice(from, to).map((cell) => T(formatCell(cell, report.lang)))]);
          table(head, body, null, b.rows.map((r) => r.style ?? 'line'));
        }
        return;
      }
      case 'chart':
        chart(b);
        return;
    }
  }

  function table(head: string[], body: string[][], widths: number[] | null, styles?: string[]) {
    const order = (row: string[]) => (rtl ? [...row].reverse() : row);
    const labelIndex = rtl ? (head.length || body[0]?.length || 1) - 1 : 0;
    const columnStyles: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number; fontStyle?: 'bold' | 'normal' }> = {};
    const n = head.length || body[0]?.length || 0;
    for (let i = 0; i < n; i += 1) columnStyles[i] = { halign: i === labelIndex ? (rtl ? 'right' : 'left') : 'right' };
    if (widths) widths.forEach((w, i) => { const idx = rtl ? n - 1 - i : i; columnStyles[idx] = { ...columnStyles[idx], cellWidth: CONTENT_W * w }; });
    else columnStyles[labelIndex] = { ...columnStyles[labelIndex], cellWidth: Math.min(70, CONTENT_W * 0.38) };
    autoTable(doc, {
      startY: y,
      head: head.length ? [order(head)] : undefined,
      body: body.map(order),
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 4, bottom: 18 },
      styles: { font, fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { font, fontStyle: 'bold', fillColor: NAVY, textColor: 255, halign: 'center' },
      columnStyles,
      theme: 'grid',
      didParseCell: (data) => {
        if (data.section !== 'body' || !styles) return;
        const st = styles[data.row.index];
        if (st === 'total' || st === 'subtotal' || st === 'section') data.cell.styles.fontStyle = 'bold';
        if (st === 'section') data.cell.styles.fillColor = [232, 238, 247];
        if (st === 'total') data.cell.styles.fillColor = [241, 245, 249];
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  function chart(b: Extract<Block, { kind: 'chart' }>) {
    const h = 62;
    ensure(h + 14);
    writeLines(b.title, 10, 'bold');
    const values = b.series.flatMap((s) => s.values).map((v) => (b.unit === 'mad' ? v / 100 : v));
    if (values.length === 0 || values.every((v) => v === 0)) {
      writeLines(STR.emptyData[report.lang], 8.5, 'normal', [100, 116, 139]);
      return;
    }
    const maxV = Math.max(0, ...values);
    const minV = Math.min(0, ...values);
    const span = maxV - minV || 1;
    const left = MARGIN + 22;
    const right = PAGE_W - MARGIN;
    const top = y + 2;
    const bottom = y + h - 10;
    const yOf = (v: number) => bottom - ((v - minV) / span) * (bottom - top);
    doc.setDrawColor(203, 213, 225);
    setFont('normal', 6.5);
    for (let k = 0; k <= 4; k += 1) {
      const v = minV + (span * k) / 4;
      const yy = yOf(v);
      doc.line(left, yy, right, yy);
      doc.text(formatNumber(v, report.lang), left - 1.5, yy + 1, { align: 'right' });
    }
    doc.setDrawColor(100, 116, 139);
    doc.line(left, yOf(0), right, yOf(0));
    const n = b.labels.length;
    const step = (right - left) / Math.max(1, n);
    const labelEvery = Math.max(1, Math.ceil(n / 12));
    // Bars and points are laid out left-to-right in both languages, like the time axis of the on-screen charts.
    if (b.type === 'bar') {
      const bw = (step * 0.8) / b.series.length;
      b.series.forEach((s, si) => {
        doc.setFillColor(...SERIES_COLORS[si % SERIES_COLORS.length]);
        s.values.forEach((raw, i) => {
          const v = b.unit === 'mad' ? raw / 100 : raw;
          const x = left + i * step + step * 0.1 + si * bw;
          const y0 = yOf(0);
          const y1 = yOf(v);
          doc.rect(x, Math.min(y0, y1), Math.max(0.3, bw - 0.4), Math.max(0.2, Math.abs(y1 - y0)), 'F');
        });
      });
    } else {
      b.series.forEach((s, si) => {
        doc.setDrawColor(...SERIES_COLORS[si % SERIES_COLORS.length]);
        doc.setLineWidth(0.4);
        for (let i = 1; i < s.values.length; i += 1) {
          const a = b.unit === 'mad' ? s.values[i - 1] / 100 : s.values[i - 1];
          const c = b.unit === 'mad' ? s.values[i] / 100 : s.values[i];
          doc.line(left + (i - 1 + 0.5) * step, yOf(a), left + (i + 0.5) * step, yOf(c));
        }
        doc.setLineWidth(0.2);
      });
    }
    setFont('normal', 6.5);
    doc.setTextColor(71, 85, 105);
    b.labels.forEach((label, i) => { if (i % labelEvery === 0) doc.text(T(label), left + (i + 0.5) * step, bottom + 4, { align: 'center' }); });
    let lx = left;
    b.series.forEach((s, si) => {
      doc.setFillColor(...SERIES_COLORS[si % SERIES_COLORS.length]);
      doc.rect(lx, bottom + 6.5, 3, 2, 'F');
      doc.text(T(s.name), lx + 4, bottom + 8.3);
      lx += 6 + doc.getTextWidth(T(s.name)) + 4;
    });
    doc.setTextColor(30, 41, 59);
    y = bottom + 14;
  }

  // Table of contents
  doc.setPage(tocPage);
  y = MARGIN + 6;
  setFont('bold', 16);
  doc.setTextColor(...NAVY);
  doc.text(T(STR.toc[report.lang]), xStart, y, { align });
  doc.setTextColor(30, 41, 59);
  y += 12;
  setFont('normal', 10.5);
  report.sections.forEach((s, i) => {
    if (y > PAGE_H - 25) return;
    const page = String(sectionPages[i]);
    if (rtl) {
      numbered(i + 1, s.title, PAGE_W - MARGIN, y);
      doc.text(page, MARGIN, y, { align: 'left' });
    } else {
      doc.text(doc.splitTextToSize(T(`${i + 1}. ${s.title}`), CONTENT_W - 20)[0] as string, MARGIN, y);
      doc.text(page, PAGE_W - MARGIN, y, { align: 'right' });
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, y + 1.8, PAGE_W - MARGIN, y + 1.8);
    y += 7.5;
  });

  // Footers
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p += 1) {
    doc.setPage(p);
    setFont('normal', 7.5);
    doc.setTextColor(100, 116, 139);
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
    const left = T(`${report.studyName} — ${report.title}`);
    const right = `${p} / ${total}`;
    if (rtl) {
      doc.text(left, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
      doc.text(right, MARGIN, PAGE_H - 7, { align: 'left' });
    } else {
      doc.text(left, MARGIN, PAGE_H - 7);
      doc.text(right, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
    }
  }
  return doc.output('arraybuffer');
}
