/**
 * Editable Word export of a Business Studio report. The file is a real Office Open XML document built from the
 * same report model as the PDF and the Excel workbook. Chart images are optional; every chart also keeps its
 * series in a table so the figures stay in the document.
 */

import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
  type ISectionOptions,
} from 'docx';
import { formatCentsMad, formatNumber } from './i18n';
import { formatCell, isDraftStatus, type Block, type Report } from './report-model';

const NAVY = '142B55';
const GOLD = 'F4B544';
const TEAL = '00AFA0';

/** Splits a wide year axis into balanced groups so the last table is not a single column. */
function periodRanges(count: number, max: number): Array<[number, number]> {
  if (count <= max) return [[0, count]];
  const parts = Math.ceil(count / max);
  const base = Math.floor(count / parts);
  let extra = count - base * parts;
  const out: Array<[number, number]> = [];
  let from = 0;
  for (let i = 0; i < parts; i += 1) {
    const len = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    out.push([from, from + len]);
    from += len;
  }
  return out;
}
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const CONTENT_DXA = 9360;

function run(text: string, opts: { bold?: boolean; size?: number; color?: string; font?: string } = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    size: opts.size ?? 21,
    color: opts.color,
    font: opts.font ?? 'Calibri',
  });
}

function para(text: string, opts: { bold?: boolean; size?: number; color?: string; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; rtl?: boolean } = {}) {
  return new Paragraph({
    heading: opts.heading,
    bidirectional: opts.rtl,
    alignment: opts.align ?? (opts.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT),
    spacing: { after: 120 },
    children: [run(text, opts)],
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string; rtl?: boolean; color?: string; size?: number } = {}) {
  return new TableCell({
    borders: BORDERS,
    width: { size: 1, type: WidthType.AUTO },
    shading: opts.fill ? { fill: opts.fill } : undefined,
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
    children: [new Paragraph({
      bidirectional: opts.rtl,
      alignment: opts.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [run(text, { bold: opts.bold, size: opts.size ?? 18, color: opts.color })],
    })],
  });
}

function table(head: string[], rows: string[][], rtl: boolean) {
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: head.map((h) => cell(h, { bold: true, fill: NAVY, color: 'FFFFFF', rtl, size: 18 })),
  });
  const body = rows.map((row, i) => new TableRow({
    cantSplit: true,
    children: row.map((value) => cell(value, { fill: i % 2 === 0 ? 'FFFFFF' : 'F8FAFC', rtl })),
  }));
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    rows: [header, ...body],
  });
}

function chartValues(block: Extract<Block, { kind: 'chart' }>, lang: Report['lang']): string[][] {
  return block.labels.map((label, i) => [
    label,
    ...block.series.map((s) => (block.unit === 'mad' ? formatCentsMad(s.values[i] ?? 0, lang) : formatNumber(s.values[i] ?? 0, lang))),
  ]);
}

function blocksOf(block: Block, report: Report, images: ReadonlyMap<string, Uint8Array>): Array<Paragraph | Table> {
  const rtl = report.lang === 'ar';
  const out: Array<Paragraph | Table> = [];
  switch (block.kind) {
    case 'paragraph':
      out.push(para(block.text, { rtl }));
      break;
    case 'notice':
      out.push(para(block.text, { rtl, bold: block.tone !== 'info', color: block.tone === 'critical' ? 'B91C1C' : block.tone === 'warning' ? 'B45309' : '334155' }));
      break;
    case 'list':
      if (block.title) out.push(para(block.title, { bold: true, rtl }));
      for (const item of block.items) out.push(para(`• ${item}`, { rtl }));
      break;
    case 'kv':
      if (block.title) out.push(para(block.title, { bold: true, rtl }));
      out.push(table(
        [report.lang === 'ar' ? 'البند' : 'Élément', report.lang === 'ar' ? 'القيمة' : 'Valeur'],
        block.rows.map((row) => [row.label, `${formatCell(row.cell, report.lang)}${row.note ? ` (${row.note})` : ''}`]),
        rtl,
      ));
      break;
    case 'table': {
      if (block.title) out.push(para(block.title, { bold: true, color: NAVY, rtl }));
      if (block.source) out.push(para(block.source, { size: 18, color: '475569', rtl }));
      const rows = block.rows.map((row) => [row.label, ...row.cells.map((c) => formatCell(c, report.lang))]);
      const periods = Math.max(0, block.head.length - 1);
      for (const [from, to] of periodRanges(periods, 7)) {
        out.push(table(
          [block.head[0], ...block.head.slice(1 + from, 1 + to)],
          rows.map((row) => [row[0], ...row.slice(1 + from, 1 + to)]),
          rtl,
        ));
      }
      break;
    }
    case 'chart': {
      out.push(para(block.title, { bold: true, rtl }));
      if (block.note) out.push(para(block.note, { size: 16, color: '64748B', rtl }));
      const image = images.get(block.title);
      if (image) {
        out.push(new Paragraph({
          bidirectional: rtl,
          spacing: { after: 120 },
          children: [new ImageRun({ type: 'png', data: image, transformation: { width: 620, height: 280 }, altText: { name: block.title, title: block.title, description: block.title } })],
        }));
      }
      const chartHead = [report.lang === 'ar' ? 'الفترة' : 'Période', ...block.series.map((s) => s.name)];
      const chartRows = chartValues(block, report.lang);
      const seriesCount = Math.max(0, chartHead.length - 1);
      for (const [from, to] of periodRanges(seriesCount, 7)) {
        out.push(table(
          [chartHead[0], ...chartHead.slice(1 + from, 1 + to)],
          chartRows.map((row) => [row[0], ...row.slice(1 + from, 1 + to)]),
          rtl,
        ));
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** Builds a .docx buffer. `images` maps a chart title to a PNG of that chart. */
export async function renderReportDocx(report: Report, images: ReadonlyMap<string, Uint8Array> = new Map()): Promise<Uint8Array> {
  const rtl = report.lang === 'ar';
  const font = rtl ? 'Arial' : 'Calibri';
  const children: Array<Paragraph | Table> = [];
  children.push(new Paragraph({
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { after: 80 },
    children: [run(report.title, { bold: true, size: 36, color: NAVY, font })],
  }));
  children.push(new Paragraph({
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: TEAL, space: 4 } },
    children: [run(report.studyName, { size: 28, bold: true, color: NAVY })],
  }));
  if (isDraftStatus(report.status)) {
    children.push(para(
      rtl ? 'مسودة — دراسة غير مصادق عليها. الأرقام توقعية.' : 'BROUILLON — étude non validée. Les chiffres sont un prévisionnel.',
      { bold: true, color: 'E85C69', size: 24, rtl },
    ));
  }
  children.push(table(
    [rtl ? 'البند' : 'Élément', rtl ? 'القيمة' : 'Valeur'],
    report.cover,
    rtl,
  ));
  for (const disclaimer of report.disclaimers) children.push(para(disclaimer, { size: 16, color: '475569', rtl }));
  report.sections.forEach((section, index) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { before: 280, after: 120 },
      children: [run(`${index + 1}. ${section.title}`, { bold: true, size: 28, color: NAVY, font })],
    }));
    for (const block of section.blocks) children.push(...blocksOf(block, report, images));
  });

  const section: ISectionOptions = {
    properties: {
      page: { margin: { top: 720, bottom: 860, left: 720, right: 720 } },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          border: { top: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
          children: [
            run(`${report.studyName} — ${report.title}    `, { size: 16, color: '475569', font }),
            new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, font, color: '475569' }),
          ],
        })],
      }),
    },
    children,
  };
  const doc = new Document({
    styles: { default: { document: { run: { font } } } },
    sections: [section],
  });
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
