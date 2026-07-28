/**
 * Master multi-sheet Excel workbook — Atlas OS dossier complet (DGI / PCGE Maroc).
 */

import ExcelJS from 'exceljs';
import type { MasterExportData } from '@/app/lib/atlas-master-export-data';
import { sanitizeExportFilenamePart } from '@/app/lib/atlas-bank-export';

const COLOR_HEADER = 'FF1B365D';
const COLOR_SECTION = 'FF0F2C59';
const COLOR_TOTAL = 'FFF2F2F2';
const COLOR_BORDER = 'FFD9D9D9';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';
const FONT = 'Calibri';
const CURRENCY_FMT = '#,##0.00';
const TEXT_FMT = '@';
const PERCENT_FMT = '0%';

function headerFill(color = COLOR_HEADER): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLOR_BORDER } },
    left: { style: 'thin', color: { argb: COLOR_BORDER } },
    bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
    right: { style: 'thin', color: { argb: COLOR_BORDER } },
  };
}

function totalBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLOR_BLACK } },
    left: { style: 'thin', color: { argb: COLOR_BORDER } },
    bottom: { style: 'double', color: { argb: COLOR_BLACK } },
    right: { style: 'thin', color: { argb: COLOR_BORDER } },
  };
}

function setTextCell(cell: ExcelJS.Cell, value: string): void {
  cell.value = value;
  cell.numFmt = TEXT_FMT;
}

function cellLen(cell: ExcelJS.Cell): number {
  return cell.text?.length ?? String(cell.value ?? '').length;
}

function autoFit(ws: ExcelJS.Worksheet, colCount: number): void {
  for (let c = 1; c <= colCount; c += 1) {
    let max = 12;
    ws.eachRow({ includeEmpty: false }, row => {
      max = Math.max(max, cellLen(row.getCell(c)));
    });
    ws.getColumn(c).width = Math.min(Math.max(max + 3, 12), 52);
  }
}

function titleBanner(ws: ExcelJS.Worksheet, title: string, cols: number, row = 1): void {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = { name: FONT, size: 14, bold: true, color: { argb: COLOR_WHITE } };
  cell.fill = headerFill();
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(row).height = 28;
}

function tableHeader(ws: ExcelJS.Worksheet, rowNum: number, headers: string[]): void {
  const row = ws.getRow(rowNum);
  row.height = 22;
  headers.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLOR_WHITE } };
    cell.fill = headerFill();
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });
}

function writeKpiRow(ws: ExcelJS.Worksheet, rowNum: number, label: string, value: string | number, isCurrency = false): void {
  ws.getCell(rowNum, 1).value = label;
  ws.getCell(rowNum, 1).font = { name: FONT, size: 10, bold: true };
  const valCell = ws.getCell(rowNum, 2);
  valCell.value = value;
  valCell.font = { name: FONT, size: 10 };
  if (isCurrency && typeof value === 'number') {
    valCell.numFmt = CURRENCY_FMT;
    ws.getCell(rowNum, 3).value = 'MAD';
  }
}

function buildDashboardSheet(wb: ExcelJS.Workbook, data: MasterExportData): void {
  const ws = wb.addWorksheet('Tableau de Bord');
  titleBanner(ws, 'TABLEAU DE BORD & SYNTHÈSE — ATLAS OS', 4);
  ws.getRow(2).height = 8;

  ws.getCell(3, 1).value = 'Société:';
  ws.getCell(3, 1).font = { name: FONT, size: 10, bold: true };
  ws.mergeCells(3, 2, 3, 4);
  ws.getCell(3, 2).value = data.companyName;

  ws.getCell(4, 1).value = 'ICE:';
  ws.getCell(4, 1).font = { name: FONT, size: 10, bold: true };
  setTextCell(ws.getCell(4, 2), data.companyIce);

  ws.getCell(4, 3).value = 'Exercice:';
  ws.getCell(4, 3).font = { name: FONT, size: 10, bold: true };
  ws.getCell(4, 4).value = data.periodLabel;

  ws.mergeCells(6, 1, 6, 4);
  ws.getCell(6, 1).value = 'Indicateurs clés';
  ws.getCell(6, 1).font = { name: FONT, size: 11, bold: true, color: { argb: COLOR_WHITE } };
  ws.getCell(6, 1).fill = headerFill(COLOR_SECTION);

  const k = data.kpis;
  writeKpiRow(ws, 7, 'Solde global (trésorerie)', k.soldeGlobal, true);
  writeKpiRow(ws, 8, 'Balance clients (impayés TTC)', k.balanceClients, true);
  writeKpiRow(ws, 9, 'Balance fournisseurs (à payer TTC)', k.balanceFournisseurs, true);
  writeKpiRow(ws, 10, 'Chiffre d\'affaires HT', k.chiffreAffairesHT, true);
  writeKpiRow(ws, 11, 'Achats HT', k.achatsHT, true);
  writeKpiRow(ws, 12, 'TVA nette', k.tvaNette, true);
  writeKpiRow(ws, 13, 'Statut fiscal global', k.statutFiscal, false);
  writeKpiRow(ws, 14, 'Opérations bancaires', k.transactionsCount, false);
  writeKpiRow(ws, 15, 'Factures fournisseurs', k.supplierInvoicesCount, false);
  writeKpiRow(ws, 16, 'Lignes journal comptable', k.journalLinesCount, false);

  ws.getCell(18, 1).value = `Exporté le ${new Date(data.exportedAt).toLocaleString('fr-FR')}`;
  ws.getCell(18, 1).font = { name: FONT, size: 9, italic: true, color: { argb: 'FF666666' } };

  autoFit(ws, 4);
}

function buildSupplierSheet(wb: ExcelJS.Workbook, data: MasterExportData): void {
  const ws = wb.addWorksheet('Factures Fournisseurs');
  const headers = ['N° Facture', 'Fournisseur', 'ICE Fournisseur', 'Date', 'Montant HT', 'Taux TVA', 'Montant TVA', 'Montant TTC', 'Statut'];
  const colCount = headers.length;
  const dataStart = 4;

  titleBanner(ws, 'FACTURES FOURNISSEURS — DOCUMENTS IA', colCount);
  tableHeader(ws, 3, headers);

  ws.getColumn(1).numFmt = TEXT_FMT;
  ws.getColumn(3).numFmt = TEXT_FMT;

  data.supplierInvoices.forEach((inv, i) => {
    const r = ws.getRow(dataStart + i);
    setTextCell(r.getCell(1), inv.invoiceNumber);
    r.getCell(2).value = inv.supplierName;
    setTextCell(r.getCell(3), inv.supplierIce);
    r.getCell(4).value = inv.invoiceDate;
    r.getCell(5).value = inv.amountHT;
    r.getCell(5).numFmt = CURRENCY_FMT;
    r.getCell(6).value = inv.vatRate > 0 ? inv.vatRate / 100 : 0;
    r.getCell(6).numFmt = PERCENT_FMT;
    r.getCell(7).value = inv.vatAmount;
    r.getCell(7).numFmt = CURRENCY_FMT;
    r.getCell(8).value = inv.amountTTC;
    r.getCell(8).numFmt = CURRENCY_FMT;
    r.getCell(9).value = inv.statusLabel;
    for (let c = 1; c <= colCount; c += 1) {
      r.getCell(c).font = { name: FONT, size: 10 };
      r.getCell(c).border = thinBorder();
    }
  });

  const totalRowNum = data.supplierInvoices.length > 0 ? dataStart + data.supplierInvoices.length : dataStart;
  const lastData = totalRowNum - 1;
  const totalRow = ws.getRow(totalRowNum);
  totalRow.getCell(4).value = 'Total';
  totalRow.getCell(4).font = { name: FONT, size: 10, bold: true };
  totalRow.getCell(4).alignment = { horizontal: 'right' };

  if (data.supplierInvoices.length > 0) {
    totalRow.getCell(5).value = { formula: `SUM(E${dataStart}:E${lastData})` };
    totalRow.getCell(7).value = { formula: `SUM(G${dataStart}:G${lastData})` };
    totalRow.getCell(8).value = { formula: `SUM(H${dataStart}:H${lastData})` };
  } else {
    totalRow.getCell(5).value = 0;
    totalRow.getCell(7).value = 0;
    totalRow.getCell(8).value = 0;
  }
  for (const col of [5, 7, 8]) {
    const cell = totalRow.getCell(col);
    cell.numFmt = CURRENCY_FMT;
    cell.font = { name: FONT, size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL } };
    cell.border = totalBorder();
  }

  autoFit(ws, colCount);
}

function buildTvaSheet(wb: ExcelJS.Workbook, data: MasterExportData): void {
  const ws = wb.addWorksheet('Déclaration TVA');
  const headers = ['N°', 'N° Facture', 'Désignation', 'Montant HT', 'Taux (%)', 'Montant TVA', 'Montant TTC', 'ICE Fournisseur', 'Nom / Raison Sociale', 'Date'];
  const colCount = headers.length;
  const dataStart = 4;

  titleBanner(ws, `DÉCLARATION TVA — ${data.tvaPeriodLabel}`, colCount);
  tableHeader(ws, 3, headers);

  ws.getColumn(2).numFmt = TEXT_FMT;
  ws.getColumn(8).numFmt = TEXT_FMT;
  ws.getColumn(10).numFmt = TEXT_FMT;

  data.tvaRows.forEach((row, i) => {
    const r = ws.getRow(dataStart + i);
    r.getCell(1).value = row.num;
    setTextCell(r.getCell(2), row.numFacture);
    r.getCell(3).value = row.designation;
    r.getCell(4).value = row.montantHT;
    r.getCell(4).numFmt = CURRENCY_FMT;
    r.getCell(5).value = row.taux / 100;
    r.getCell(5).numFmt = PERCENT_FMT;
    r.getCell(6).value = row.montantTVA;
    r.getCell(6).numFmt = CURRENCY_FMT;
    r.getCell(7).value = row.montantTTC;
    r.getCell(7).numFmt = CURRENCY_FMT;
    setTextCell(r.getCell(8), row.iceFournisseur);
    r.getCell(9).value = row.nomFournisseur;
    setTextCell(r.getCell(10), row.dateFacture);
    for (let c = 1; c <= colCount; c += 1) {
      r.getCell(c).font = { name: FONT, size: 10 };
      r.getCell(c).border = thinBorder();
    }
  });

  const totalRowNum = data.tvaRows.length > 0 ? dataStart + data.tvaRows.length : dataStart;
  const lastData = totalRowNum - 1;
  const totalRow = ws.getRow(totalRowNum);
  totalRow.getCell(3).value = 'Total';
  totalRow.getCell(3).font = { name: FONT, size: 10, bold: true };
  totalRow.getCell(3).alignment = { horizontal: 'right' };

  if (data.tvaRows.length > 0) {
    totalRow.getCell(4).value = { formula: `SUM(D${dataStart}:D${lastData})` };
    totalRow.getCell(6).value = { formula: `SUM(F${dataStart}:F${lastData})` };
    totalRow.getCell(7).value = { formula: `SUM(G${dataStart}:G${lastData})` };
  } else {
    totalRow.getCell(4).value = 0;
    totalRow.getCell(6).value = 0;
    totalRow.getCell(7).value = 0;
  }
  for (const col of [4, 6, 7]) {
    const cell = totalRow.getCell(col);
    cell.numFmt = CURRENCY_FMT;
    cell.font = { name: FONT, size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL } };
    cell.border = totalBorder();
  }

  autoFit(ws, colCount);
}

function writeIsAmountRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  label: string,
  amount: number,
  opts?: { bold?: boolean; total?: boolean },
): void {
  ws.getCell(rowNum, 1).value = label;
  ws.getCell(rowNum, 1).font = { name: FONT, size: 10, bold: Boolean(opts?.bold) };
  ws.mergeCells(rowNum, 2, rowNum, 3);
  const cell = ws.getCell(rowNum, 2);
  cell.value = amount;
  cell.numFmt = CURRENCY_FMT;
  cell.font = { name: FONT, size: 10, bold: Boolean(opts?.bold) };
  cell.alignment = { horizontal: 'right' };
  ws.getCell(rowNum, 4).value = 'MAD';
  if (opts?.total) {
    for (let c = 1; c <= 4; c += 1) {
      ws.getCell(rowNum, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL } };
      ws.getCell(rowNum, c).border = totalBorder();
    }
  }
}

function buildIsSheet(wb: ExcelJS.Workbook, data: MasterExportData): void {
  const ws = wb.addWorksheet('Impôt sur Sociétés');
  const draft = data.isDraft;
  titleBanner(ws, 'IMPÔT SUR LES SOCIÉTÉS (IS) — MAROC', 4);
  ws.getRow(2).height = 8;

  if (!draft) {
    ws.getCell(4, 1).value = 'Aucun brouillon IS disponible pour cet exercice.';
    ws.getCell(4, 1).font = { name: FONT, size: 10, italic: true };
    autoFit(ws, 4);
    return;
  }

  let row = 4;
  const section = (title: string) => {
    ws.mergeCells(row, 1, row, 4);
    ws.getCell(row, 1).value = title;
    ws.getCell(row, 1).font = { name: FONT, size: 11, bold: true, color: { argb: COLOR_WHITE } };
    ws.getCell(row, 1).fill = headerFill(COLOR_SECTION);
    row += 1;
  };

  section('Produits d\'Exploitation');
  writeIsAmountRow(ws, row, 'Chiffre d\'affaires HT', draft.revenueHT);
  row += 1;
  writeIsAmountRow(ws, row, 'Total Produits d\'Exploitation', draft.revenueHT, { bold: true });
  row += 2;

  section('Charges d\'Exploitation');
  writeIsAmountRow(ws, row, 'Achats Fournisseurs HT', draft.supplierExpensesHT);
  row += 1;
  writeIsAmountRow(ws, row, 'Charges Personnel', draft.payrollTotal);
  row += 1;
  writeIsAmountRow(ws, row, 'Autres Charges Comptables', draft.accountingCharges);
  row += 1;
  const totalCharges = draft.supplierExpensesHT + draft.payrollTotal + draft.accountingCharges;
  writeIsAmountRow(ws, row, 'Total Charges d\'Exploitation', totalCharges, { bold: true });
  row += 2;

  section('Résultat Fiscal et Liquidation IS');
  writeIsAmountRow(ws, row, 'Résultat Fiscal Net', draft.taxableResult, { bold: true });
  row += 1;
  const rateRaw = draft.sourcesJson.appliedRate;
  ws.getCell(row, 1).value = 'Taux IS appliqué';
  ws.getCell(row, 1).font = { name: FONT, size: 10 };
  ws.getCell(row, 2).value = rateRaw != null ? String(rateRaw) : '—';
  row += 1;
  writeIsAmountRow(ws, row, 'Impôt sur Sociétés Calculé', draft.estimatedIS);
  row += 1;
  writeIsAmountRow(ws, row, 'Cotisation Minimale (0,5% CA)', draft.minimalContribution);
  row += 1;
  writeIsAmountRow(ws, row, 'Impôt Dû', draft.isDue, { bold: true, total: true });

  autoFit(ws, 4);
}

function buildBankSheet(wb: ExcelJS.Workbook, data: MasterExportData): void {
  const ws = wb.addWorksheet('Opérations Bancaires');
  const headers = ['Date', 'Libellé / Référence', 'Débit (MAD)', 'Crédit (MAD)', 'Statut Rapprochement'];
  const colCount = headers.length;
  const dataStart = 4;

  titleBanner(ws, 'OPÉRATIONS BANCAIRES', colCount);
  tableHeader(ws, 3, headers);

  data.bankRows.forEach((row, i) => {
    const r = ws.getRow(dataStart + i);
    r.getCell(1).value = row.date;
    r.getCell(2).value = row.libelleReference;
    if (row.debit != null) {
      r.getCell(3).value = row.debit;
      r.getCell(3).numFmt = CURRENCY_FMT;
    }
    if (row.credit != null) {
      r.getCell(4).value = row.credit;
      r.getCell(4).numFmt = CURRENCY_FMT;
    }
    r.getCell(5).value = row.reconStatus;
    for (let c = 1; c <= colCount; c += 1) {
      r.getCell(c).font = { name: FONT, size: 10 };
      r.getCell(c).border = thinBorder();
    }
  });

  autoFit(ws, colCount);
}

function buildJournalSheet(wb: ExcelJS.Workbook, data: MasterExportData): void {
  const ws = wb.addWorksheet('Journal Comptable');
  const headers = ['Date', 'Libellé', 'Compte', 'Débit (MAD)', 'Crédit (MAD)', 'Source Document IA', 'Statut'];
  const colCount = headers.length;
  const dataStart = 4;

  titleBanner(ws, 'JOURNAL COMPTABLE — PCGE MAROC', colCount);
  tableHeader(ws, 3, headers);

  ws.getColumn(3).numFmt = TEXT_FMT;
  ws.getColumn(6).numFmt = TEXT_FMT;

  data.journalRows.forEach((row, i) => {
    const r = ws.getRow(dataStart + i);
    r.getCell(1).value = row.date;
    r.getCell(2).value = row.libelle;
    setTextCell(r.getCell(3), row.compte);
    r.getCell(4).value = row.debit > 0 ? row.debit : '';
    r.getCell(5).value = row.credit > 0 ? row.credit : '';
    if (row.debit > 0) r.getCell(4).numFmt = CURRENCY_FMT;
    if (row.credit > 0) r.getCell(5).numFmt = CURRENCY_FMT;
    setTextCell(r.getCell(6), row.sourceDocumentId);
    r.getCell(7).value = row.validationStatus;
    for (let c = 1; c <= colCount; c += 1) {
      r.getCell(c).font = { name: FONT, size: 10 };
      r.getCell(c).border = thinBorder();
    }
  });

  autoFit(ws, colCount);
}

export async function generateMasterExportBuffer(data: MasterExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zafirix Pro — Atlas OS';
  wb.created = new Date();

  buildDashboardSheet(wb, data);
  buildSupplierSheet(wb, data);
  buildTvaSheet(wb, data);
  buildIsSheet(wb, data);
  buildBankSheet(wb, data);
  buildJournalSheet(wb, data);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function masterExportFilename(companyName: string, year: number): string {
  const safe = sanitizeExportFilenamePart(companyName);
  return `Atlas_OS_Dossier_Complet_${safe}_${year}.xlsx`;
}
