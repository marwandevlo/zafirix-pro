/**
 * Editable Word export of a Business Studio report. The file is a real Office Open XML document built from the
 * same report model as the PDF and the Excel workbook. Chart images are optional; every chart also keeps its
 * series in a table so the figures stay in the document.
 */

import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
  type ISectionOptions,
} from 'docx';
import { formatCentsMad, formatNumber } from './i18n';
import { formatCell, isDraftStatus, type Block, type Report } from './report-model';

const NAVY = '1B2A4A';
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

function cell(text: string, opts: { bold?: boolean; fill?: string; rtl?: boolean } = {}) {
  return new TableCell({
    borders: BORDERS,
    width: { size: 1, type: WidthType.AUTO },
    shading: opts.fill ? { fill: opts.fill } : undefined,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new Paragraph({
      bidirectional: opts.rtl,
      alignment: opts.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [run(text, { bold: opts.bold, size: 16 })],
    })],
  });
}

function table(head: string[], rows: string[][], rtl: boolean) {
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: head.map((h) => cell(h, { bold: true, fill: 'E8EEF7', rtl })),
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
    case 'table':
      if (block.title) out.push(para(block.title, { bold: true, rtl }));
      if (block.source) out.push(para(block.source, { size: 16, color: '64748B', rtl }));
      out.push(table(block.head, block.rows.map((row) => [row.label, ...row.cells.map((c) => formatCell(c, report.lang))]), rtl));
      break;
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
      out.push(table(
        [report.lang === 'ar' ? 'الفترة' : 'Période', ...block.series.map((s) => s.name)],
        chartValues(block, report.lang),
        rtl,
      ));
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
  children.push(para(report.studyName, { size: 28, bold: true, rtl }));
  if (isDraftStatus(report.status)) {
    children.push(para(
      rtl ? 'مسودة — دراسة غير مصادق عليها. الأرقام توقعية.' : 'BROUILLON — étude non validée. Les chiffres sont un prévisionnel.',
      { bold: true, color: 'B45309', size: 24, rtl },
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
      page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
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
