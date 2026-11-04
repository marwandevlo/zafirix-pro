/**
 * PDF rendering of a Business Studio report: cover page, table of contents with page numbers, sections, vector
 * charts drawn from the report's series, and "page x / n" footers. Arabic reports are laid out right-to-left and
 * need the Amiri font (public/fonts/amiri, SIL Open Font License) passed in `fonts`.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCentsMad, formatNumber, formatPercent, STR } from './i18n';
import { formatCell, type Block, type RCell, type Report } from './report-model';

export type PdfFonts = { regular: string; bold?: string };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_PERIOD_COLUMNS = 7;
const NAVY: [number, number, number] = [27, 42, 74];
const SERIES_COLORS: Array<[number, number, number]> = [
  [27, 42, 74], [217, 119, 6], [5, 150, 105], [190, 24, 93], [37, 99, 235], [124, 58, 237], [100, 116, 139], [202, 138, 4], [13, 148, 136], [220, 38, 38],
];

/** Characters missing from the standard WinAnsi fonts, used only when no embedded font is available. */
function winAnsiSafe(s: string): string {
  return s.replace(/\u2212/g, '-').replace(/Σ/g, 'Somme ').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/\u202f/g, ' ').replace(/[^\x20-\x7E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC\u2022]/g, '?');
}

/** Axis ticks on round values (1, 2, 2.5 or 5 × 10^n) covering [min, max], zero included. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (min === max) { min = Math.min(0, min); max = Math.max(0, max) || 1; }
  const rough = (max - min) / Math.max(1, target - 1);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= rough) ?? 10 * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : Number(v.toPrecision(12)));
  return out;
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
  if (rtl) {
    // jsPDF's default bidi pass treats every line as a left-to-right paragraph (trailing punctuation and "%" land on
    // the wrong side), so Arabic lines are reordered as right-to-left paragraphs. That mode puts a leading minus after
    // its number, hence the minus is moved behind the digits beforehand.
    const ARABIC = /[\u0600-\u06FF]/;
    const RTL_BIDI = { isInputVisual: false, isOutputVisual: true, isInputRtl: true, isOutputRtl: false, isSymmetricSwapping: true };
    const fixMinus = (s: string) => s.replace(/(^|[\s:(«—])([\u2212-])(\d(?:[\d,.\u202f\u00a0]*\d)?)/g, '$1$3$2');
    const baseText = doc.text.bind(doc) as (...a: unknown[]) => jsPDF;
    doc.text = ((text: string | string[], x: number, y: number, options?: object, transform?: unknown) => {
      const lines = Array.isArray(text) ? text : [text];
      if (!lines.some((l) => ARABIC.test(String(l)))) return baseText(text, x, y, options, transform);
      const fixed = Array.isArray(text) ? text.map((l) => fixMinus(String(l))) : fixMinus(text);
      return baseText(fixed, x, y, { ...options, ...RTL_BIDI }, transform);
    }) as typeof doc.text;
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
  y = 84;
  for (const [k, v] of report.cover) {
    setFont('bold', 10.5);
    doc.text(T(k), xStart, y, { align });
    setFont('normal', 10.5);
    const lines = doc.splitTextToSize(T(v), CONTENT_W - 58) as string[];
    doc.text(lines[0] ?? '', rtl ? xStart - 58 : xStart + 58, y, { align });
    y += 7.4;
  }
  y += 4;
  doc.setFillColor(...(report.checksOk ? [220, 252, 231] as [number, number, number] : [254, 226, 226] as [number, number, number]));
  doc.rect(MARGIN, y - 5, CONTENT_W, 10, 'F');
  setFont('bold', 10);
  doc.text(T(report.checksOk ? STR.checksOk[report.lang] : STR.checksKo[report.lang]), xStart + (rtl ? -3 : 3), y + 1.5, { align });
  y = Math.max(y + 12, 236);
  for (const d of report.disclaimers) writeLines(d, 8.5, 'normal', [71, 85, 105]);

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
    section.blocks.forEach((b, i) => renderBlock(b, section.blocks[i + 1]));
  }

  /** Height kept free under a table so that a short footnote right after it never lands alone on a new page. */
  function footnoteReserve(next: Block | undefined): number {
    if (next?.kind !== 'notice' || next.text.length > 240) return 0;
    setFont('normal', 8.5);
    return (doc.splitTextToSize(T(next.text), CONTENT_W) as string[]).length * 8.5 * 0.42 + 5;
  }

  function renderBlock(b: Block, next?: Block) {
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
        for (const item of b.items) {
          setFont('normal', 9);
          doc.setTextColor(30, 41, 59);
          const lines = doc.splitTextToSize(T(item), CONTENT_W - 5) as string[];
          const lh = 9 * 0.42;
          lines.forEach((line, i) => {
            ensure(lh);
            if (i === 0) doc.text('•', xStart, y, { align });
            doc.text(line, rtl ? xStart - 4 : xStart + 4, y, { align });
            y += lh;
          });
        }
        y += 2;
        return;
      case 'kv': {
        if (b.title) { ensure(10); writeLines(b.title, 10.5, 'bold'); y += 1; }
        const withNotes = b.rows.some((r) => r.note);
        const value = (c: RCell) => {
          const s = formatCell(c, report.lang);
          return 'u' in c && (c.u === 'mad' || c.u === 'mad_unit') && c.v != null ? `${s} ${STR.mad[report.lang]}` : s;
        };
        const body = b.rows.map((r) => (withNotes ? [T(r.label), T(value(r.cell)), T(r.note ?? '')] : [T(r.label), T(value(r.cell))]));
        const textRows = b.rows.map((r) => 's' in r.cell);
        table([], body, withNotes ? [0.4, 0.24, 0.36] : [0.55, 0.45], undefined, textRows);
        return;
      }
      case 'table': {
        if (b.title) { ensure(10); writeLines(b.title, 10.5, 'bold'); y += 1; }
        const hasMad = b.rows.some((r) => r.cells.some((c) => 'u' in c && (c.u === 'mad' || c.u === 'mad_unit')));
        if (hasMad && !/MAD|درهم/.test(b.head.join(' '))) {
          setFont('normal', 7);
          doc.setTextColor(100, 116, 139);
          ensure(5);
          doc.text(T(STR.amountsInMad[report.lang]), rtl ? MARGIN : PAGE_W - MARGIN, y - 1, { align: rtl ? 'left' : 'right' });
          doc.setTextColor(30, 41, 59);
          y += 2;
        }
        const periodCols = b.head.length - 1;
        const textCols = b.head.slice(1).map((_, i) => b.rows.length > 0 && b.rows.every((r) => !r.cells[i] || 's' in r.cells[i]));
        const longest = (i: number) => Math.max(b.head[i + 1]?.length ?? 0, ...b.rows.map((r) => (r.cells[i] ? formatCell(r.cells[i], report.lang).length : 0)));
        const fixed: number[] = textCols.map((isText, i) => (!isText ? 0.12 : longest(i) <= 16 ? 0.12 : 0));
        const long = fixed.filter((w) => w === 0).length;
        if (textCols.some(Boolean) && 0.28 + fixed.reduce((s, w) => s + w, 0) + long * 0.12 <= 1) {
          const label = long ? 0.28 : Math.max(0.28, 1 - fixed.reduce((s, w) => s + w, 0));
          const share = long ? Math.max(0.12, (1 - label - fixed.reduce((s, w) => s + w, 0)) / long) : 0;
          const head = b.head.map(T);
          const body = b.rows.map((r) => [T(r.label), ...b.head.slice(1).map((_, i) => T(r.cells[i] ? formatCell(r.cells[i], report.lang) : ''))]);
          table(head, body, [label, ...fixed.map((w) => w || share)], b.rows.map((r) => r.style ?? 'line'), undefined, [true, ...textCols], footnoteReserve(next));
          return;
        }
        const chunks = periodCols > MAX_PERIOD_COLUMNS + 1 ? Math.ceil(periodCols / MAX_PERIOD_COLUMNS) : 1;
        for (let c = 0; c < chunks; c += 1) {
          const from = chunks === 1 ? 0 : c * MAX_PERIOD_COLUMNS;
          const to = chunks === 1 ? periodCols : Math.min(periodCols, from + MAX_PERIOD_COLUMNS);
          const head = [b.head[0], ...b.head.slice(1 + from, 1 + to)].map(T);
          const body = b.rows.map((r) => [T(r.label), ...r.cells.slice(from, to).map((cell) => T(formatCell(cell, report.lang)))]);
          table(head, body, null, b.rows.map((r) => r.style ?? 'line'), undefined, undefined, c === chunks - 1 ? footnoteReserve(next) : 0);
        }
        return;
      }
      case 'chart':
        chart(b);
        return;
    }
  }

  function table(head: string[], body: string[][], widths: number[] | null, styles?: string[], textRows?: boolean[], startAligned?: boolean[], reserveBelow = 0) {
    const order = (row: string[]) => (rtl ? [...row].reverse() : row);
    const labelIndex = rtl ? (head.length || body[0]?.length || 1) - 1 : 0;
    const valueIndex = rtl ? labelIndex - 1 : 1;
    const columnStyles: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number; fontStyle?: 'bold' | 'normal' }> = {};
    const n = head.length || body[0]?.length || 0;
    for (let i = 0; i < n; i += 1) columnStyles[i] = { halign: i === labelIndex ? (rtl ? 'right' : 'left') : 'right' };
    let fontSize = 7.5;
    if (widths) widths.forEach((w, i) => { const idx = rtl ? n - 1 - i : i; columnStyles[idx] = { ...columnStyles[idx], cellWidth: CONTENT_W * w }; });
    else {
      // Period columns share what the label leaves; numbers must stay on one line, so the label narrows first, then the font.
      let labelW = Math.min(70, CONTENT_W * 0.38);
      if (n > 1) {
        const values = body.flatMap((row) => row.slice(1));
        const need = (fs: number) => {
          doc.setFont(font, 'bold');
          doc.setFontSize(fs);
          return Math.max(0, ...values.map((s) => doc.getTextWidth(s))) * 1.04 + 2 * 1.2 + 0.4;
        };
        const fits = (fs: number, lw: number) => need(fs) * (n - 1) <= CONTENT_W - lw;
        const minLabel = CONTENT_W * 0.26;
        while (!fits(fontSize, labelW) && labelW > minLabel) labelW = Math.max(minLabel, labelW - 2);
        while (!fits(fontSize, labelW) && fontSize > 6) fontSize -= 0.25;
      }
      columnStyles[labelIndex] = { ...columnStyles[labelIndex], cellWidth: labelW };
    }
    startAligned?.forEach((s, i) => { if (s) { const idx = rtl ? n - 1 - i : i; columnStyles[idx] = { ...columnStyles[idx], halign: rtl ? 'right' : 'left' }; } });
    autoTable(doc, {
      startY: y,
      head: head.length ? [order(head)] : undefined,
      body: body.map(order),
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 4, bottom: 18 + reserveBelow },
      styles: { font, fontSize, cellPadding: 1.2, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { font, fontStyle: 'bold', fillColor: NAVY, textColor: 255, halign: 'center' },
      columnStyles,
      theme: 'grid',
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if (textRows?.[data.row.index] && data.column.index === valueIndex) data.cell.styles.halign = rtl ? 'right' : 'left';
        if (textRows && data.column.index === labelIndex) data.cell.styles.fontStyle = 'bold';
        if (!styles) return;
        const st = styles[data.row.index];
        if (st === 'total' || st === 'subtotal' || st === 'section') data.cell.styles.fontStyle = 'bold';
        if (st === 'section') data.cell.styles.fillColor = [232, 238, 247];
        if (st === 'total') data.cell.styles.fillColor = [241, 245, 249];
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  function chartHeader(b: Extract<Block, { kind: 'chart' }>, h: number, scaleLabel: string | null) {
    ensure(h + 14);
    writeLines(b.title, 10, 'bold');
    const sub = [b.note, scaleLabel].filter(Boolean).join(' ');
    if (sub) writeLines(sub, 7.5, 'normal', [100, 116, 139]);
  }

  function polygon(points: Array<[number, number]>) {
    const [x0, y0] = points[0];
    const deltas = points.slice(1).map(([px, py], i) => [px - points[i][0], py - points[i][1]]);
    doc.lines(deltas, x0, y0, [1, 1], 'F', true);
  }

  function donut(b: Extract<Block, { kind: 'chart' }>) {
    const values = (b.series[0]?.values ?? []).map((v) => Math.max(0, v));
    const totalV = values.reduce((a, v) => a + v, 0);
    chartHeader(b, 58, null);
    if (totalV <= 0) { writeLines(STR.emptyData[report.lang], 8.5, 'normal', [100, 116, 139]); return; }
    const R = 24;
    const cx = rtl ? PAGE_W - MARGIN - R - 2 : MARGIN + R + 2;
    const cy = y + R + 2;
    let a0 = -Math.PI / 2;
    values.forEach((v, i) => {
      if (v <= 0) return;
      const a1 = a0 + (v / totalV) * Math.PI * 2;
      const pts: Array<[number, number]> = [[cx, cy]];
      const steps = Math.max(2, Math.ceil(((a1 - a0) * 180) / Math.PI / 3));
      for (let k = 0; k <= steps; k += 1) {
        const a = a0 + ((a1 - a0) * k) / steps;
        pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      }
      doc.setFillColor(...SERIES_COLORS[i % SERIES_COLORS.length]);
      polygon(pts);
      a0 = a1;
    });
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, R * 0.55, 'F');
    setFont('bold', 7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(formatCentsOrCount(totalV, b.unit), cx, cy + 1, { align: 'center' });
    setFont('normal', 6);
    doc.text(T(b.unit === 'mad' ? STR.mad[report.lang] : ''), cx, cy + 4, { align: 'center' });
    let ly = y + 4;
    const lx = rtl ? cx - R - 8 : cx + R + 8;
    setFont('normal', 8);
    values.forEach((v, i) => {
      const share = (v / totalV) * 100;
      doc.setFillColor(...SERIES_COLORS[i % SERIES_COLORS.length]);
      doc.rect(rtl ? lx - 3 : lx, ly - 2.4, 3, 3, 'F');
      const text = `${b.labels[i]} — ${formatCentsOrCount(v, b.unit)}${b.unit === 'mad' ? ` ${STR.mad[report.lang]}` : ''} — ${formatPercent(share, report.lang)}`;
      const line = (doc.splitTextToSize(T(text), CONTENT_W - 2 * R - 20) as string[])[0];
      doc.text(line, rtl ? lx - 5 : lx + 5, ly, { align: rtl ? 'right' : 'left' });
      ly += 6;
    });
    y = Math.max(cy + R + 6, ly + 2);
  }

  function pyramid(b: Extract<Block, { kind: 'chart' }>) {
    const values = b.series[0]?.values ?? [];
    const maxAbs = Math.max(0, ...values.map((v) => Math.abs(v)));
    const rowH = 7;
    chartHeader(b, values.length * rowH + 6, b.unit === 'mad' ? T(STR.inMad[report.lang]) : null);
    if (maxAbs === 0) { writeLines(STR.emptyData[report.lang], 8.5, 'normal', [100, 116, 139]); return; }
    const labelW = 52;
    const valueW = 34;
    const barMax = CONTENT_W - labelW - valueW - 4;
    const center = rtl ? MARGIN + valueW + barMax / 2 : MARGIN + labelW + barMax / 2;
    values.forEach((v, i) => {
      const yy = y + i * rowH;
      const w = Math.max(0.8, (Math.abs(v) / maxAbs) * barMax);
      doc.setFillColor(...(v < 0 ? [185, 28, 28] as [number, number, number] : SERIES_COLORS[0]));
      doc.rect(center - w / 2, yy, w, rowH - 1.6, 'F');
      setFont('normal', 8);
      doc.setTextColor(30, 41, 59);
      if (rtl) {
        doc.text(T(b.labels[i]), PAGE_W - MARGIN, yy + 4, { align: 'right' });
        doc.text(formatCentsOrCount(v, b.unit), MARGIN, yy + 4, { align: 'left' });
      } else {
        doc.text(T(b.labels[i]), MARGIN, yy + 4);
        doc.text(formatCentsOrCount(v, b.unit), PAGE_W - MARGIN, yy + 4, { align: 'right' });
      }
    });
    y += values.length * rowH + 4;
  }

  function formatCentsOrCount(v: number, unit: 'mad' | 'count') {
    return unit === 'mad' ? formatCentsMad(v, report.lang) : formatNumber(v, report.lang);
  }

  function chart(b: Extract<Block, { kind: 'chart' }>) {
    if (b.type === 'donut') { donut(b); return; }
    if (b.type === 'pyramid') { pyramid(b); return; }
    const h = 62;
    const raw = b.series.flatMap((s) => s.values).map((v) => (b.unit === 'mad' ? v / 100 : v));
    const thousands = b.unit === 'mad' && Math.max(0, ...raw.map(Math.abs)) >= 1_000_000;
    const scale = thousands ? 1000 : 1;
    chartHeader(b, h, b.unit === 'mad' ? T(thousands ? STR.inThousandsMad[report.lang] : STR.inMad[report.lang]) : null);
    const values = raw.map((v) => v / scale);
    if (values.length === 0 || values.every((v) => v === 0)) {
      writeLines(STR.emptyData[report.lang], 8.5, 'normal', [100, 116, 139]);
      return;
    }
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
    const minV = ticks[0];
    const maxV = ticks[ticks.length - 1];
    const span = maxV - minV || 1;
    const left = MARGIN + 22;
    const right = PAGE_W - MARGIN;
    const top = y + 2;
    const bottom = y + h - 10;
    const yOf = (v: number) => bottom - ((v - minV) / span) * (bottom - top);
    doc.setDrawColor(203, 213, 225);
    setFont('normal', 6.5);
    for (const v of ticks) {
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
        s.values.forEach((rv, i) => {
          const v = (b.unit === 'mad' ? rv / 100 : rv) / scale;
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
          const a = (b.unit === 'mad' ? s.values[i - 1] / 100 : s.values[i - 1]) / scale;
          const c = (b.unit === 'mad' ? s.values[i] / 100 : s.values[i]) / scale;
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
