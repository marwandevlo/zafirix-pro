import ExcelJS from 'exceljs';
import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';
import {
  buildDgiClientInfo,
  buildDgiReleveRows,
  type DgiTvaClientInfo,
} from '@/app/lib/atlas-tva-dgi';

const COL_COUNT = 12;
const METADATA_START_ROW = 3;
const HEADER_ROW = 6;
const DATA_START_ROW = 7;

/** DGI professional template — dark blue header */
const COLOR_HEADER_BLUE = 'FF1B365D';
const COLOR_TOTAL_GRAY = 'FFF2F2F2';
const COLOR_BORDER_LIGHT = 'FFD9D9D9';
const COLOR_BLACK = 'FF000000';
const COLOR_WHITE = 'FFFFFFFF';
const FONT_CALIBRI = 'Calibri';

const DOCUMENT_TITLE = 'RELEVÉ DE DÉDUCTIONS (TVA) - MAROC';
const SHEET_NAME = 'Relevé de Déductions';

const TABLE_HEADERS = [
  'N°',
  'N° Facture',
  'Désignation des Biens ou Services',
  'Montant HT',
  'Taux (%)',
  'Montant TVA',
  'Montant TTC',
  'ICE Fournisseur',
  'Nom / Raison Sociale',
  'Date Facture',
  'Mode Paiement',
  'Date Paiement',
];

const CURRENCY_FMT = '#,##0.00';
const PERCENT_FMT = '0%';
const TEXT_FMT = '@';

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    left: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    bottom: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    right: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
  };
}

function totalBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLOR_BLACK } },
    left: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    bottom: { style: 'double', color: { argb: COLOR_BLACK } },
    right: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
  };
}

function headerFillStyle(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BLUE } };
}

function setTextCell(cell: ExcelJS.Cell, value: string): void {
  cell.value = value;
  cell.numFmt = TEXT_FMT;
}

function cellDisplayLength(cell: ExcelJS.Cell): number {
  const text = cell.text?.trim();
  if (text) return text.length;
  if (cell.value == null) return 0;
  if (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value) {
    return String((cell.value as { formula?: string }).formula ?? '').length;
  }
  return String(cell.value).length;
}

/** Auto-fit column widths from row 1 through the last populated row. */
function autoFitColumns(ws: ExcelJS.Worksheet, fromRow = 1): void {
  for (let colIndex = 1; colIndex <= COL_COUNT; colIndex += 1) {
    const headerLen = TABLE_HEADERS[colIndex - 1]?.length ?? 10;
    let maxLen = headerLen;

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < fromRow) return;
      maxLen = Math.max(maxLen, cellDisplayLength(row.getCell(colIndex)));
    });

    ws.getColumn(colIndex).width = Math.min(Math.max(maxLen + 3, 10), 48);
  }
}

function applyTableHeaderStyle(cell: ExcelJS.Cell, label: string): void {
  cell.value = label;
  cell.font = { name: FONT_CALIBRI, size: 10, bold: true, color: { argb: COLOR_WHITE } };
  cell.fill = headerFillStyle();
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = thinBorder();
}

function writeMetadataBlock(ws: ExcelJS.Worksheet, clientInfo: DgiTvaClientInfo): void {
  const labelFont: Partial<ExcelJS.Font> = { name: FONT_CALIBRI, size: 11, bold: true };
  const valueFont: Partial<ExcelJS.Font> = { name: FONT_CALIBRI, size: 10 };

  ws.getCell(METADATA_START_ROW, 1).value = 'Client / Société:';
  ws.getCell(METADATA_START_ROW, 1).font = labelFont;
  ws.mergeCells(METADATA_START_ROW, 2, METADATA_START_ROW, 5);
  ws.getCell(METADATA_START_ROW, 2).value = clientInfo.nom_client;
  ws.getCell(METADATA_START_ROW, 2).font = valueFont;

  ws.getCell(METADATA_START_ROW, 7).value = 'Période:';
  ws.getCell(METADATA_START_ROW, 7).font = labelFont;
  ws.mergeCells(METADATA_START_ROW, 8, METADATA_START_ROW, 10);
  ws.getCell(METADATA_START_ROW, 8).value = clientInfo.periodLabel;
  ws.getCell(METADATA_START_ROW, 8).font = valueFont;

  ws.getCell(METADATA_START_ROW + 1, 1).value = 'ICE Client:';
  ws.getCell(METADATA_START_ROW + 1, 1).font = labelFont;
  ws.mergeCells(METADATA_START_ROW + 1, 2, METADATA_START_ROW + 1, 5);
  setTextCell(ws.getCell(METADATA_START_ROW + 1, 2), clientInfo.ice_client);
  ws.getCell(METADATA_START_ROW + 1, 2).font = valueFont;

  ws.getCell(METADATA_START_ROW + 1, 7).value = 'Exercice:';
  ws.getCell(METADATA_START_ROW + 1, 7).font = labelFont;
  ws.getCell(METADATA_START_ROW + 1, 8).value = clientInfo.periodKey.endsWith('-AN')
    ? `${clientInfo.annee} (Annuel)`
    : `${clientInfo.annee} — T${clientInfo.periode}`;
  ws.getCell(METADATA_START_ROW + 1, 8).font = valueFont;
}

/** Build a DGI-styled Relevé de déductions workbook buffer (ExcelJS). */
export async function generateTvaReleveExcelBuffer(
  record: AtlasTvaPeriodRecord,
  company: { name?: string | null; legal_name?: string | null; trade_name?: string | null; ice?: string | null },
): Promise<Buffer> {
  const clientInfo = buildDgiClientInfo(record, company);
  const rows = buildDgiReleveRows(record);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zafirix Pro';
  wb.created = new Date();

  const ws = wb.addWorksheet(SHEET_NAME.slice(0, 31));
  ws.views = [{ showGridLines: true }];

  // Text columns — prevent scientific notation / dropped leading zeros
  ws.getColumn(2).numFmt = TEXT_FMT;
  ws.getColumn(8).numFmt = TEXT_FMT;
  ws.getColumn(10).numFmt = TEXT_FMT;
  ws.getColumn(12).numFmt = TEXT_FMT;

  // ── Title banner ──────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COL_COUNT);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = DOCUMENT_TITLE;
  titleCell.font = { name: FONT_CALIBRI, size: 14, bold: true, color: { argb: COLOR_WHITE } };
  titleCell.fill = headerFillStyle();
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;

  // Row 2 spacer
  ws.getRow(2).height = 6;

  writeMetadataBlock(ws, clientInfo);

  // Row 5 spacer before table
  ws.getRow(HEADER_ROW - 1).height = 8;

  // ── Table header ──────────────────────────────────────────────────────────
  const headerRow = ws.getRow(HEADER_ROW);
  headerRow.height = 24;
  TABLE_HEADERS.forEach((label, idx) => {
    applyTableHeaderStyle(headerRow.getCell(idx + 1), label);
  });

  // ── Data rows ─────────────────────────────────────────────────────────────
  rows.forEach((item, rowIdx) => {
    const r = DATA_START_ROW + rowIdx;
    const excelRow = ws.getRow(r);

    excelRow.getCell(1).value = item.ord;
    excelRow.getCell(1).alignment = { horizontal: 'center' };

    setTextCell(excelRow.getCell(2), item.num);
    excelRow.getCell(2).alignment = { horizontal: 'left' };

    excelRow.getCell(3).value = item.des;
    excelRow.getCell(3).alignment = { horizontal: 'left', wrapText: true };

    excelRow.getCell(4).value = item.mht;
    excelRow.getCell(4).numFmt = CURRENCY_FMT;
    excelRow.getCell(4).alignment = { horizontal: 'right' };

    excelRow.getCell(5).value = item.tx / 100;
    excelRow.getCell(5).numFmt = PERCENT_FMT;
    excelRow.getCell(5).alignment = { horizontal: 'center' };

    excelRow.getCell(6).value = item.tva;
    excelRow.getCell(6).numFmt = CURRENCY_FMT;
    excelRow.getCell(6).alignment = { horizontal: 'right' };

    excelRow.getCell(7).value = item.ttc;
    excelRow.getCell(7).numFmt = CURRENCY_FMT;
    excelRow.getCell(7).alignment = { horizontal: 'right' };

    setTextCell(excelRow.getCell(8), item.refF.ice);
    excelRow.getCell(8).alignment = { horizontal: 'center' };

    excelRow.getCell(9).value = item.refF.nom;
    excelRow.getCell(9).alignment = { horizontal: 'left' };

    setTextCell(excelRow.getCell(10), item.dfac);
    excelRow.getCell(10).alignment = { horizontal: 'center' };

    excelRow.getCell(11).value = item.modePaiement;
    excelRow.getCell(11).alignment = { horizontal: 'center' };

    setTextCell(excelRow.getCell(12), item.dpai);
    excelRow.getCell(12).alignment = { horizontal: 'center' };

    for (let c = 1; c <= COL_COUNT; c += 1) {
      const cell = excelRow.getCell(c);
      cell.font = { name: FONT_CALIBRI, size: 10 };
      cell.border = thinBorder();
    }
  });

  // ── Total row ─────────────────────────────────────────────────────────────
  const totalRowNum = rows.length > 0 ? DATA_START_ROW + rows.length : DATA_START_ROW;
  const totalRow = ws.getRow(totalRowNum);
  const lastDataRow = totalRowNum - 1;

  totalRow.getCell(3).value = 'Total';
  totalRow.getCell(3).font = { name: FONT_CALIBRI, size: 10, bold: true };
  totalRow.getCell(3).alignment = { horizontal: 'right' };

  if (rows.length > 0) {
    totalRow.getCell(4).value = { formula: `SUM(D${DATA_START_ROW}:D${lastDataRow})` };
    totalRow.getCell(6).value = { formula: `SUM(F${DATA_START_ROW}:F${lastDataRow})` };
    totalRow.getCell(7).value = { formula: `SUM(G${DATA_START_ROW}:G${lastDataRow})` };
  } else {
    totalRow.getCell(4).value = 0;
    totalRow.getCell(6).value = 0;
    totalRow.getCell(7).value = 0;
  }

  for (const col of [4, 6, 7] as const) {
    const cell = totalRow.getCell(col);
    cell.numFmt = CURRENCY_FMT;
    cell.font = { name: FONT_CALIBRI, size: 10, bold: true };
    cell.alignment = { horizontal: 'right' };
  }

  for (let c = 1; c <= COL_COUNT; c += 1) {
    const cell = totalRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_GRAY } };
    cell.border = totalBorder();
    if (c !== 3 && c !== 4 && c !== 6 && c !== 7) {
      cell.font = { name: FONT_CALIBRI, size: 10, bold: c === 3 };
    }
  }

  autoFitColumns(ws, 1);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function tvaReleveExcelFilename(periodKey: string): string {
  return `Releve_TVA_${periodKey.replace(/[^\w-]+/g, '_')}.xlsx`;
}
