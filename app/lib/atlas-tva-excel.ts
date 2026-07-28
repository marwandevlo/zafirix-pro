import ExcelJS from 'exceljs';
import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';
import {
  buildDgiClientInfo,
  buildDgiReleveRows,
  type DgiTvaClientInfo,
} from '@/app/lib/atlas-tva-dgi';

const COL_COUNT = 12;
const HEADER_ROW = 6;
const DATA_START_ROW = 7;

const COLOR_DGI_BLUE = 'FF1F497D';
const COLOR_TOTAL_GRAY = 'FFF2F2F2';
const COLOR_BORDER_LIGHT = 'FFD9D9D9';
const COLOR_BLACK = 'FF000000';

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

function autoFitColumns(ws: ExcelJS.Worksheet, minRow: number): void {
  ws.columns.forEach((column, index) => {
    let maxLen = TABLE_HEADERS[index]?.length ?? 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      if (Number(cell.row) < minRow) return;
      const len = cell.value == null ? 0 : String(cell.value).length;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.max(maxLen + 4, 12);
  });
}

function sheetTitle(clientInfo: DgiTvaClientInfo): string {
  if (clientInfo.periodKey.endsWith('-AN')) {
    return `Relevé de Déductions Annuel ${clientInfo.annee}`.slice(0, 31);
  }
  return `Relevé de Déductions Q${clientInfo.periode} ${clientInfo.annee}`.slice(0, 31);
}

/** Build a DGI-styled Relevé de déductions workbook buffer (ExcelJS ≈ openpyxl styling). */
export async function generateTvaReleveExcelBuffer(
  record: AtlasTvaPeriodRecord,
  company: { name?: string | null; legal_name?: string | null; trade_name?: string | null; ice?: string | null },
): Promise<Buffer> {
  const clientInfo = buildDgiClientInfo(record, company);
  const rows = buildDgiReleveRows(record);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zafirix Pro';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetTitle(clientInfo));
  ws.views = [{ showGridLines: true }];

  ws.mergeCells(1, 1, 1, COL_COUNT);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'RELEVÉ DE DÉDUCTIONS (TVA) - MAROC';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR_DGI_BLUE },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;

  ws.getCell(3, 1).value = 'Client / Société:';
  ws.getCell(3, 1).font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell(3, 2).value = clientInfo.nom_client;
  ws.getCell(3, 2).font = { name: 'Calibri', size: 10 };

  ws.getCell(3, 4).value = 'Période:';
  ws.getCell(3, 4).font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell(3, 5).value = clientInfo.periodLabel;
  ws.getCell(3, 5).font = { name: 'Calibri', size: 10 };

  ws.getCell(4, 1).value = 'ICE Client:';
  ws.getCell(4, 1).font = { name: 'Calibri', size: 11, bold: true };
  const iceClientCell = ws.getCell(4, 2);
  iceClientCell.value = clientInfo.ice_client;
  iceClientCell.numFmt = TEXT_FMT;
  iceClientCell.font = { name: 'Calibri', size: 10 };

  const headerRow = ws.getRow(HEADER_ROW);
  headerRow.height = 22;
  TABLE_HEADERS.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_DGI_BLUE },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });

  rows.forEach((item, rowIdx) => {
    const r = DATA_START_ROW + rowIdx;
    const excelRow = ws.getRow(r);

    excelRow.getCell(1).value = item.num;
    excelRow.getCell(1).alignment = { horizontal: 'center' };

    excelRow.getCell(2).value = item.numFacture;
    excelRow.getCell(2).alignment = { horizontal: 'left' };

    excelRow.getCell(3).value = item.designation;
    excelRow.getCell(3).alignment = { horizontal: 'left' };

    excelRow.getCell(4).value = item.montantHT;
    excelRow.getCell(4).numFmt = CURRENCY_FMT;
    excelRow.getCell(4).alignment = { horizontal: 'right' };

    excelRow.getCell(5).value = item.taux / 100;
    excelRow.getCell(5).numFmt = PERCENT_FMT;
    excelRow.getCell(5).alignment = { horizontal: 'center' };

    excelRow.getCell(6).value = item.montantTVA;
    excelRow.getCell(6).numFmt = CURRENCY_FMT;
    excelRow.getCell(6).alignment = { horizontal: 'right' };

    excelRow.getCell(7).value = item.montantTTC;
    excelRow.getCell(7).numFmt = CURRENCY_FMT;
    excelRow.getCell(7).alignment = { horizontal: 'right' };

    const iceCell = excelRow.getCell(8);
    iceCell.value = item.iceFournisseur;
    iceCell.numFmt = TEXT_FMT;
    iceCell.alignment = { horizontal: 'center' };

    excelRow.getCell(9).value = item.nomFournisseur;
    excelRow.getCell(9).alignment = { horizontal: 'left' };

    excelRow.getCell(10).value = item.dateFacture;
    excelRow.getCell(10).alignment = { horizontal: 'center' };

    excelRow.getCell(11).value = item.modePaiement;
    excelRow.getCell(11).alignment = { horizontal: 'center' };

    excelRow.getCell(12).value = item.datePaiement;
    excelRow.getCell(12).alignment = { horizontal: 'center' };

    for (let c = 1; c <= COL_COUNT; c += 1) {
      const cell = excelRow.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = thinBorder();
    }
  });

  const totalRowNum = DATA_START_ROW + rows.length;
  const totalRow = ws.getRow(totalRowNum);

  totalRow.getCell(3).value = 'Total';
  totalRow.getCell(3).font = { name: 'Calibri', size: 10, bold: true };
  totalRow.getCell(3).alignment = { horizontal: 'right' };

  const lastDataRow = totalRowNum - 1;
  if (rows.length > 0) {
    totalRow.getCell(4).value = { formula: `SUM(D${DATA_START_ROW}:D${lastDataRow})` };
    totalRow.getCell(6).value = { formula: `SUM(F${DATA_START_ROW}:F${lastDataRow})` };
    totalRow.getCell(7).value = { formula: `SUM(G${DATA_START_ROW}:G${lastDataRow})` };
  } else {
    totalRow.getCell(4).value = 0;
    totalRow.getCell(6).value = 0;
    totalRow.getCell(7).value = 0;
  }

  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  totalRow.getCell(6).numFmt = CURRENCY_FMT;
  totalRow.getCell(7).numFmt = CURRENCY_FMT;
  totalRow.getCell(4).font = { name: 'Calibri', size: 10, bold: true };
  totalRow.getCell(6).font = { name: 'Calibri', size: 10, bold: true };
  totalRow.getCell(7).font = { name: 'Calibri', size: 10, bold: true };

  for (let c = 1; c <= COL_COUNT; c += 1) {
    const cell = totalRow.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_TOTAL_GRAY },
    };
    cell.border = totalBorder();
  }

  autoFitColumns(ws, HEADER_ROW);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function tvaReleveExcelFilename(periodKey: string): string {
  return `Releve_TVA_${periodKey.replace(/[^\w-]+/g, '_')}.xlsx`;
}
