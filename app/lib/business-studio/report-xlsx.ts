/**
 * Excel rendering of a Business Studio report. Amounts are written as numbers in MAD (centimes ÷ 100) with
 * two decimals, so the workbook carries exactly the engine values. Arabic workbooks are right-to-left.
 */

import ExcelJS from 'exceljs';
import { STR } from './i18n';
import { formatCell, type Block, type RCell, type Report } from './report-model';

const NUM_FMT = {
  mad: '#,##0.00;[Red]-#,##0.00',
  pct: '0.0%;[Red]-0.0%',
  ratio: '0.00',
  count: '#,##0.##',
  months: '0',
  years: '0.0',
} as const;

const FILL_SECTION: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const FILL_HEAD: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } };

function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Feuille';
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${i++}`;
  used.add(name.toLowerCase());
  return name;
}

function writeCell(cell: ExcelJS.Cell, c: RCell, lang: Report['lang']) {
  if ('s' in c) { cell.value = c.s; return; }
  if (c.v == null || !Number.isFinite(c.v)) { cell.value = formatCell(c, lang); cell.alignment = { horizontal: 'center' }; return; }
  switch (c.u) {
    case 'mad': cell.value = c.v / 100; break;
    case 'pct': cell.value = c.v / 100; break;
    default: cell.value = c.v;
  }
  cell.numFmt = NUM_FMT[c.u];
}

function writeBlock(ws: ExcelJS.Worksheet, b: Block, lang: Report['lang'], row: number): number {
  const width = 8;
  switch (b.kind) {
    case 'paragraph':
    case 'notice': {
      ws.mergeCells(row, 1, row, width);
      const cell = ws.getCell(row, 1);
      cell.value = b.text;
      cell.alignment = { wrapText: true, vertical: 'top' };
      if (b.kind === 'notice') cell.font = { italic: true, color: { argb: b.tone === 'critical' ? 'FFB91C1C' : b.tone === 'warning' ? 'FF92400E' : 'FF475569' } };
      ws.getRow(row).height = Math.min(120, 15 * Math.ceil(b.text.length / 110));
      return row + 2;
    }
    case 'list': {
      if (b.title) { ws.getCell(row, 1).value = b.title; ws.getCell(row, 1).font = { bold: true }; row += 1; }
      for (const item of b.items) { ws.mergeCells(row, 1, row, width); ws.getCell(row, 1).value = `• ${item}`; ws.getCell(row, 1).alignment = { wrapText: true }; row += 1; }
      return row + 1;
    }
    case 'kv': {
      for (const kv of b.rows) {
        ws.getCell(row, 1).value = kv.label;
        writeCell(ws.getCell(row, 2), kv.cell, lang);
        if (kv.note) { ws.getCell(row, 3).value = kv.note; ws.getCell(row, 3).font = { italic: true, color: { argb: 'FF64748B' } }; }
        row += 1;
      }
      return row + 1;
    }
    case 'table': {
      if (b.title) { ws.getCell(row, 1).value = b.title; ws.getCell(row, 1).font = { bold: true, size: 12 }; row += 1; }
      b.head.forEach((h, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = FILL_HEAD;
        cell.alignment = { horizontal: i === 0 ? (lang === 'ar' ? 'right' : 'left') : 'center', wrapText: true };
      });
      row += 1;
      for (const r of b.rows) {
        const label = ws.getCell(row, 1);
        label.value = r.label;
        const strong = r.style === 'total' || r.style === 'subtotal' || r.style === 'section';
        if (strong) label.font = { bold: true };
        if (r.style === 'detail') label.alignment = { indent: 2 };
        r.cells.forEach((c, i) => {
          const cell = ws.getCell(row, i + 2);
          writeCell(cell, c, lang);
          if (strong) cell.font = { bold: true };
        });
        if (r.style === 'section') for (let i = 1; i <= b.head.length; i += 1) ws.getCell(row, i).fill = FILL_SECTION;
        if (r.style === 'total') for (let i = 1; i <= b.head.length; i += 1) ws.getCell(row, i).border = { top: { style: 'thin' }, bottom: { style: 'double' } };
        row += 1;
      }
      if (b.source) { ws.getCell(row, 1).value = b.source; ws.getCell(row, 1).font = { italic: true, size: 9 }; row += 1; }
      return row + 1;
    }
    case 'chart': {
      ws.getCell(row, 1).value = `${b.title} — ${lang === 'ar' ? 'بيانات الرسم البياني' : 'données du graphique'}`;
      ws.getCell(row, 1).font = { bold: true };
      row += 1;
      ws.getCell(row, 1).value = lang === 'ar' ? 'الفترة' : 'Période';
      b.series.forEach((s, i) => { ws.getCell(row, i + 2).value = s.name; ws.getCell(row, i + 2).font = { bold: true }; });
      row += 1;
      b.labels.forEach((label, li) => {
        ws.getCell(row, 1).value = label;
        b.series.forEach((s, si) => writeCell(ws.getCell(row, si + 2), b.unit === 'mad' ? { v: s.values[li], u: 'mad' } : { v: s.values[li], u: 'count' }, lang));
        row += 1;
      });
      return row + 1;
    }
  }
}

export async function renderReportXlsx(report: Report): Promise<ArrayBuffer> {
  const lang = report.lang;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZafirixPro — Business Studio';
  wb.created = new Date(report.generatedAt);
  wb.title = report.title;
  const used = new Set<string>();
  const footer = `&L${report.studyName.replace(/&/g, '&&')}&R${STR.page[lang]} &P / &N`;
  const sheet = (name: string) => {
    const ws = wb.addWorksheet(sheetName(name, used), {
      views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 0 }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      headerFooter: { oddFooter: footer, evenFooter: footer },
    });
    ws.getColumn(1).width = 46;
    for (let i = 2; i <= 40; i += 1) ws.getColumn(i).width = 16;
    return ws;
  };

  const cover = sheet(lang === 'ar' ? 'الغلاف' : 'Couverture');
  cover.getCell('A1').value = report.title;
  cover.getCell('A1').font = { bold: true, size: 18 };
  const coverRows: Array<[string, string]> = [
    [lang === 'ar' ? 'الدراسة' : 'Étude', report.studyName],
    [STR.company[lang], report.companyName || '—'],
    [STR.sector[lang], report.sector],
    [STR.projectType[lang], report.projectType],
    [STR.scenario[lang], report.scenarioName],
    [STR.status[lang], report.status || '—'],
    [STR.revision[lang], report.revision == null ? '—' : String(report.revision)],
    [STR.generatedOn[lang], report.generatedAt.replace('T', ' ').slice(0, 16)],
    [STR.engine[lang], report.engineVersion],
    [STR.rules[lang], report.rulesVersion],
    [lang === 'ar' ? 'المراقبة' : 'Contrôles', report.checksOk ? 'OK' : STR.checksKo[lang]],
  ];
  coverRows.forEach(([k, v], i) => { cover.getCell(i + 3, 1).value = k; cover.getCell(i + 3, 1).font = { bold: true }; cover.getCell(i + 3, 2).value = v; });
  let r = coverRows.length + 5;
  for (const d of report.disclaimers) { cover.mergeCells(r, 1, r, 8); cover.getCell(r, 1).value = d; cover.getCell(r, 1).alignment = { wrapText: true }; cover.getRow(r).height = 60; r += 1; }

  const toc = sheet(STR.toc[lang]);
  toc.getCell('A1').value = STR.toc[lang];
  toc.getCell('A1').font = { bold: true, size: 14 };
  const names = report.sections.map((s) => sheetName(s.title, used));
  report.sections.forEach((s, i) => {
    const cell = toc.getCell(i + 3, 1);
    cell.value = { text: `${i + 1}. ${s.title}`, hyperlink: `#'${names[i]}'!A1` };
    cell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
  });

  report.sections.forEach((s, i) => {
    const ws = wb.addWorksheet(names[i], {
      views: [{ rightToLeft: lang === 'ar' }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      headerFooter: { oddFooter: footer, evenFooter: footer },
    });
    ws.getColumn(1).width = 46;
    for (let c = 2; c <= 40; c += 1) ws.getColumn(c).width = 16;
    ws.getCell('A1').value = `${i + 1}. ${s.title}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    let row = 3;
    for (const b of s.blocks) row = writeBlock(ws, b, lang, row);
  });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
