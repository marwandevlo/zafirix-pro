/**
 * Excel rendering of a Business Studio report. Amounts are written as numbers in MAD (centimes ÷ 100) with
 * two decimals, so the workbook carries exactly the engine values. Arabic workbooks are right-to-left.
 */

import ExcelJS from 'exceljs';
import { STR } from './i18n';
import { formatCell, type Block, type RCell, type Report } from './report-model';

const NUM_FMT = {
  mad: '#,##0.00;[Red]-#,##0.00',
  mad_unit: '#,##0.00;[Red]-#,##0.00',
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
    case 'mad':
    case 'mad_unit': cell.value = c.v / 100; break;
    case 'pct': cell.value = c.v / 100; break;
    default: cell.value = c.v;
  }
  cell.numFmt = NUM_FMT[c.u];
}

function colLetter(c: number): string {
  let s = '';
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Where each statement line was written: `${tableId}.${lineKey}` → sheet, row and the engine values per column. */
type LineRef = { sheet: string; row: number; cols: number; values: Array<number | null> };
type Registry = Map<string, LineRef>;

const cellValue = (c: RCell): number | null => ('s' in c || c.v == null || c.u !== 'mad' ? null : c.v);

function writeBlock(ws: ExcelJS.Worksheet, b: Block, lang: Report['lang'], row: number, registry: Registry): number {
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
      if (b.title) { ws.getCell(row, 1).value = b.title; ws.getCell(row, 1).font = { bold: true, size: 12 }; row += 1; }
      for (const kv of b.rows) {
        ws.getCell(row, 1).value = kv.label;
        writeCell(ws.getCell(row, 2), kv.cell, lang);
        if ('u' in kv.cell && kv.cell.u === 'mad' && kv.cell.v != null) ws.getCell(row, 2).numFmt = `#,##0.00 "${lang === 'ar' ? 'درهم' : 'MAD'}";[Red]-#,##0.00 "${lang === 'ar' ? 'درهم' : 'MAD'}"`;
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
      const local = new Map<string, { row: number; sign: 1 | -1 }>();
      b.rows.forEach((r, i) => { if (r.key && r.sign && !local.has(r.key)) local.set(r.key, { row: row + i, sign: r.sign }); });
      for (const r of b.rows) {
        const label = ws.getCell(row, 1);
        label.value = r.label;
        const strong = r.style === 'total' || r.style === 'subtotal' || r.style === 'section';
        if (strong) label.font = { bold: true };
        if (r.style === 'detail') label.alignment = { indent: 2 };
        // A subtotal becomes a live formula when every line it adds up is shown in the same table.
        const refs = r.terms?.map(([k, s]) => ({ ref: local.get(k), s })) ?? [];
        const formulaOk = refs.length > 0 && refs.every((x) => x.ref);
        r.cells.forEach((c, i) => {
          const cell = ws.getCell(row, i + 2);
          writeCell(cell, c, lang);
          const v = cellValue(c);
          if (formulaOk && v != null) {
            const col = colLetter(i + 2);
            const expr = refs.map(({ ref, s }, j) => {
              const coef = s * ref!.sign;
              return `${coef < 0 ? '-' : j === 0 ? '' : '+'}${col}${ref!.row}`;
            }).join('');
            cell.value = { formula: expr, result: v / 100 };
          }
          if (strong) cell.font = { bold: true };
        });
        if (b.id && r.key) registry.set(`${b.id}.${r.key}`, { sheet: ws.name, row, cols: r.cells.length, values: r.cells.map(cellValue) });
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
      if (b.note) { ws.getCell(row, 1).value = b.note; ws.getCell(row, 1).font = { italic: true, color: { argb: 'FF64748B' } }; row += 1; }
      ws.getCell(row, 1).value = b.type === 'donut' || b.type === 'pyramid' ? (lang === 'ar' ? 'البند' : 'Poste') : (lang === 'ar' ? 'الفترة' : 'Période');
      b.series.forEach((s, i) => { ws.getCell(row, i + 2).value = s.name; ws.getCell(row, i + 2).font = { bold: true }; });
      row += 1;
      b.labels.forEach((label, li) => {
        ws.getCell(row, 1).value = label;
        b.series.forEach((s, si) => writeCell(ws.getCell(row, si + 2), b.unit === 'mad' ? { v: s.values[li], u: 'mad' } : { v: s.values[li], u: 'count' }, lang));
        row += 1;
      });
      if (b.type === 'donut' && b.labels.length > 0) {
        const first = row - b.labels.length;
        ws.getCell(row, 1).value = lang === 'ar' ? 'المجموع' : 'Total';
        ws.getCell(row, 1).font = { bold: true };
        const totalV = (b.series[0]?.values ?? []).reduce((a, v) => a + v, 0);
        const cell = ws.getCell(row, 2);
        cell.value = { formula: `SUM(B${first}:B${row - 1})`, result: b.unit === 'mad' ? totalV / 100 : totalV };
        cell.numFmt = b.unit === 'mad' ? NUM_FMT.mad : NUM_FMT.count;
        cell.font = { bold: true };
        ws.getCell(first - 1, 3).value = lang === 'ar' ? 'الحصة' : 'Part';
        ws.getCell(first - 1, 3).font = { bold: true };
        for (let k = first; k < row; k += 1) {
          const v = (b.series[0]?.values ?? [])[k - first] ?? 0;
          const share = ws.getCell(k, 3);
          share.value = { formula: `IF($B$${row}=0,0,B${k}/$B$${row})`, result: totalV === 0 ? 0 : v / totalV };
          share.numFmt = NUM_FMT.pct;
        }
        row += 1;
      }
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
  wb.calcProperties.fullCalcOnLoad = true;
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
    ...report.cover,
    [lang === 'ar' ? 'المراقبة' : 'Contrôles', report.checksOk ? STR.checksOk[lang] : STR.checksKo[lang]],
  ];
  coverRows.forEach(([k, v], i) => { cover.getCell(i + 3, 1).value = k; cover.getCell(i + 3, 1).font = { bold: true }; cover.getCell(i + 3, 2).value = v; });
  let r = coverRows.length + 5;
  for (const d of report.disclaimers) { cover.mergeCells(r, 1, r, 8); cover.getCell(r, 1).value = d; cover.getCell(r, 1).alignment = { wrapText: true }; cover.getRow(r).height = 60; r += 1; }

  const toc = sheet(STR.toc[lang]);
  toc.getCell('A1').value = STR.toc[lang];
  toc.getCell('A1').font = { bold: true, size: 14 };
  const names = report.sections.map((s) => sheetName(s.title, used));
  const controlsName = sheetName(lang === 'ar' ? 'المراقبة' : 'Contrôles', used);
  report.sections.forEach((s, i) => {
    const cell = toc.getCell(i + 3, 1);
    cell.value = { text: `${i + 1}. ${s.title}`, hyperlink: `#'${names[i]}'!A1` };
    cell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
  });
  const tocControls = toc.getCell(report.sections.length + 4, 1);
  tocControls.value = { text: controlsName, hyperlink: `#'${controlsName}'!A1` };
  tocControls.font = { color: { argb: 'FF1D4ED8' }, underline: true };

  const registry: Registry = new Map();
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
    for (const b of s.blocks) row = writeBlock(ws, b, lang, row, registry);
  });

  writeControls(wb.addWorksheet(controlsName, {
    views: [{ rightToLeft: lang === 'ar' }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: footer, evenFooter: footer },
  }), registry, report);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Cross-sheet checks written as live formulas over the statement cells, with their cached results. */
const CONTROLS: Array<{ fr: string; ar: string; plus: string[]; minus: string[] }> = [
  { fr: 'Bilan : total actif − total passif', ar: 'الميزانية: مجموع الأصول − مجموع الخصوم', plus: ['bilan_actif.totalAssets'], minus: ['bilan_passif.totalLiabilitiesAndEquity'] },
  { fr: 'Trésorerie : encaissements − décaissements − variation', ar: 'الخزينة: المتحصلات − المدفوعات − التغير', plus: ['tresorerie.inflows'], minus: ['tresorerie.outflows', 'tresorerie.netCashFlow'] },
  { fr: 'Flux : exploitation + investissement + financement − variation', ar: 'التدفقات: الاستغلال + الاستثمار + التمويل − التغير', plus: ['tft.cfo', 'tft.cfi', 'tft.cff'], minus: ['tft.netCashFlow'] },
  { fr: 'Trésorerie de clôture : tableau des flux − plan de trésorerie', ar: 'خزينة الإقفال: جدول التدفقات − مخطط الخزينة', plus: ['tft.cash'], minus: ['tresorerie.cash'] },
  { fr: 'CPC : résultat avant impôt − impôt − résultat net', ar: 'حساب العائدات والتكاليف: النتيجة قبل الضريبة − الضريبة − النتيجة الصافية', plus: ['cpc.ebt', 'cpc.incomeTax'], minus: ['cpc.netIncome'] },
  { fr: 'CPC et SIG : résultat net identique', ar: 'حساب العائدات والأرصدة الوسيطة: نفس النتيجة الصافية', plus: ['cpc.netIncome'], minus: ['sig.netIncome'] },
];

function writeControls(ws: ExcelJS.Worksheet, registry: Registry, report: Report) {
  const lang = report.lang;
  ws.getColumn(1).width = 64;
  for (let c = 2; c <= 40; c += 1) ws.getColumn(c).width = 14;
  ws.getCell('A1').value = lang === 'ar' ? 'المراقبة (صيغ حية)' : 'Contrôles (formules actives)';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, 8);
  ws.getCell('A2').value = lang === 'ar'
    ? 'كل خلية تعيد حساب الفرق انطلاقاً من خلايا القوائم؛ يجب أن تكون النتيجة صفراً. التعديل اليدوي للقوائم يظهر هنا.'
    : 'Chaque cellule recalcule l’écart à partir des cellules des états ; le résultat attendu est zéro. Toute modification manuelle des états apparaît ici.';
  ws.getCell('A2').alignment = { wrapText: true };
  ws.getRow(2).height = 30;
  let row = 4;
  let written = 0;
  const statusCol = (n: number) => n + 2;
  for (const c of CONTROLS) {
    const refs = [...c.plus.map((k) => ({ k, s: 1 })), ...c.minus.map((k) => ({ k, s: -1 }))].map((x) => ({ ...x, ref: registry.get(x.k) }));
    if (refs.some((x) => !x.ref)) continue;
    const n = Math.min(...refs.map((x) => x.ref!.cols));
    ws.getCell(row, 1).value = lang === 'ar' ? c.ar : c.fr;
    let worst = 0;
    for (let i = 0; i < n; i += 1) {
      const col = colLetter(i + 2);
      const expr = refs.map(({ ref, s }, j) => `${s < 0 ? '-' : j === 0 ? '' : '+'}'${ref!.sheet.replace(/'/g, "''")}'!${col}${ref!.row}`).join('');
      const cents = refs.reduce((a, { ref, s }) => a + s * (ref!.values[i] ?? 0), 0);
      worst = Math.max(worst, Math.abs(cents));
      const cell = ws.getCell(row, i + 2);
      cell.value = { formula: `ROUND(${expr},2)`, result: cents / 100 };
      cell.numFmt = NUM_FMT.mad;
    }
    const range = `B${row}:${colLetter(n + 1)}${row}`;
    const st = ws.getCell(row, statusCol(n));
    st.value = { formula: `IF(AND(MAX(${range})<0.005,MIN(${range})>-0.005),"OK","${lang === 'ar' ? 'فرق' : 'ÉCART'}")`, result: worst === 0 ? 'OK' : (lang === 'ar' ? 'فرق' : 'ÉCART') };
    st.font = { bold: true, color: { argb: worst === 0 ? 'FF047857' : 'FFB91C1C' } };
    row += 1;
    written += 1;
  }
  if (written === 0) {
    ws.getCell(row, 1).value = lang === 'ar' ? 'لا تتضمن هذه الوثيقة القوائم اللازمة للمراقبة المتقاطعة.' : 'Ce document ne contient pas les états nécessaires aux contrôles croisés.';
  }
}
