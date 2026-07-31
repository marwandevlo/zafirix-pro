import ExcelJS from 'exceljs';
import type { AtlasIsDraft } from '@/app/types/atlas-payroll';
import type { AtlasIsExportCompanyInfo } from '@/app/lib/atlas-is-server';
import { validateIsExportForDgi } from '@/app/lib/atlas-is-xml';
import {
  formatDgiIce,
  resolveDgiCompanyIdentifiers,
  resolveDgiIdentifiantFiscal,
} from '@/app/lib/atlas-tva-dgi';

const COL_COUNT = 4;

const COLOR_HEADER_BLUE = 'FF1B365D';
const COLOR_SECTION_BLUE = 'FF0F2C59';
const COLOR_TOTAL_GRAY = 'FFF2F2F2';
const COLOR_BORDER_LIGHT = 'FFD9D9D9';
const COLOR_BLACK = 'FF000000';
const COLOR_WHITE = 'FFFFFFFF';
const FONT_CALIBRI = 'Calibri';

const DOCUMENT_TITLE = 'DÉCLARATION DU RÉSULTAT FISCAL ET IS - MAROC';
const SHEET_NAME = 'Déclaration IS';

const CURRENCY_FMT = '#,##0.00';
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

function headerFillStyle(color = COLOR_HEADER_BLUE): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function setTextCell(cell: ExcelJS.Cell, value: string): void {
  cell.value = value;
  cell.numFmt = TEXT_FMT;
}

function cellDisplayLength(cell: ExcelJS.Cell): number {
  const text = cell.text?.trim();
  if (text) return text.length;
  if (cell.value == null) return 0;
  return String(cell.value).length;
}

function autoFitColumns(ws: ExcelJS.Worksheet, colCount: number): void {
  for (let colIndex = 1; colIndex <= colCount; colIndex += 1) {
    let maxLen = 12;
    ws.eachRow({ includeEmpty: false }, (row) => {
      maxLen = Math.max(maxLen, cellDisplayLength(row.getCell(colIndex)));
    });
    ws.getColumn(colIndex).width = Math.min(Math.max(maxLen + 3, 14), 52);
  }
}

function writeSectionHeader(ws: ExcelJS.Worksheet, rowNum: number, title: string): void {
  ws.mergeCells(rowNum, 1, rowNum, COL_COUNT);
  const cell = ws.getCell(rowNum, 1);
  cell.value = title;
  cell.font = { name: FONT_CALIBRI, size: 11, bold: true, color: { argb: COLOR_WHITE } };
  cell.fill = headerFillStyle(COLOR_SECTION_BLUE);
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  cell.border = thinBorder();
  ws.getRow(rowNum).height = 22;
}

function writeAmountRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  label: string,
  amount: number,
  opts?: { bold?: boolean; total?: boolean },
): void {
  const row = ws.getRow(rowNum);
  row.getCell(1).value = label;
  row.getCell(1).font = {
    name: FONT_CALIBRI,
    size: 10,
    bold: Boolean(opts?.bold),
  };
  row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells(rowNum, 2, rowNum, 3);
  const amountCell = row.getCell(2);
  amountCell.value = amount;
  amountCell.numFmt = CURRENCY_FMT;
  amountCell.font = { name: FONT_CALIBRI, size: 10, bold: Boolean(opts?.bold) };
  amountCell.alignment = { horizontal: 'right', vertical: 'middle' };

  row.getCell(4).value = 'MAD';
  row.getCell(4).font = { name: FONT_CALIBRI, size: 10, bold: Boolean(opts?.bold) };
  row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

  const border = opts?.total ? totalBorder() : thinBorder();
  for (let c = 1; c <= COL_COUNT; c += 1) {
    const cell = row.getCell(c);
    cell.border = border;
    if (opts?.total) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_GRAY } };
    }
  }
}

function writeTextRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  label: string,
  value: string,
): void {
  ws.getCell(rowNum, 1).value = label;
  ws.getCell(rowNum, 1).font = { name: FONT_CALIBRI, size: 10, bold: true };
  ws.mergeCells(rowNum, 2, rowNum, COL_COUNT);
  setTextCell(ws.getCell(rowNum, 2), value);
  ws.getCell(rowNum, 2).font = { name: FONT_CALIBRI, size: 10 };
}

function companyDisplayName(company: AtlasIsExportCompanyInfo): string {
  return company.trade_name?.trim() || company.legal_name?.trim() || company.name?.trim() || '';
}

function identifiantFiscal(company: AtlasIsExportCompanyInfo): string {
  return resolveDgiIdentifiantFiscal(company.if_fiscal, company.if_number);
}

function companyIce(company: AtlasIsExportCompanyInfo): string {
  return formatDgiIce(company.ice);
}

function statusLabel(status: AtlasIsDraft['status']): string {
  return status === 'validated' ? 'Validé' : 'Brouillon';
}

function appliedRateLabel(draft: AtlasIsDraft): string {
  const raw = draft.sourcesJson.appliedRate;
  return raw != null && String(raw).trim() ? String(raw) : '—';
}

/** Build a DGI-styled IS declaration workbook buffer (ExcelJS). */
export async function generateIsDeclarationExcelBuffer(
  draft: AtlasIsDraft,
  company: AtlasIsExportCompanyInfo,
): Promise<Buffer> {
  const ids = resolveDgiCompanyIdentifiers(company);
  const validation = validateIsExportForDgi(draft, { identifiantFiscal: ids.identifiantFiscal });
  if (!validation.ok) {
    throw new Error(validation.message ?? validation.error ?? 'export_invalid');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zafirix Pro';
  wb.created = new Date();

  const ws = wb.addWorksheet(SHEET_NAME.slice(0, 31));
  ws.views = [{ showGridLines: true }];
  ws.getColumn(2).numFmt = TEXT_FMT;
  ws.getColumn(3).numFmt = CURRENCY_FMT;

  // ── Title banner ──────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COL_COUNT);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = DOCUMENT_TITLE;
  titleCell.font = { name: FONT_CALIBRI, size: 14, bold: true, color: { argb: COLOR_WHITE } };
  titleCell.fill = headerFillStyle();
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 6;

  // ── Metadata ────────────────────────────────────────────────────────────────
  ws.getCell(3, 1).value = 'Société:';
  ws.getCell(3, 1).font = { name: FONT_CALIBRI, size: 10, bold: true };
  ws.mergeCells(3, 2, 3, COL_COUNT);
  ws.getCell(3, 2).value = companyDisplayName(company);
  ws.getCell(3, 2).font = { name: FONT_CALIBRI, size: 10 };

  ws.getCell(4, 1).value = 'Identifiant Fiscal (IF):';
  ws.getCell(4, 1).font = { name: FONT_CALIBRI, size: 10, bold: true };
  setTextCell(ws.getCell(4, 2), identifiantFiscal(company));
  ws.getCell(4, 2).font = { name: FONT_CALIBRI, size: 10 };

  ws.getCell(4, 3).value = 'ICE:';
  ws.getCell(4, 3).font = { name: FONT_CALIBRI, size: 10, bold: true };
  setTextCell(ws.getCell(4, 4), companyIce(company));
  ws.getCell(4, 4).font = { name: FONT_CALIBRI, size: 10 };

  ws.getCell(5, 1).value = 'Exercice fiscal:';
  ws.getCell(5, 1).font = { name: FONT_CALIBRI, size: 10, bold: true };
  ws.getCell(5, 2).value = `${draft.fiscalYear} (${draft.periodStart} → ${draft.periodEnd})`;
  ws.getCell(5, 2).font = { name: FONT_CALIBRI, size: 10 };

  ws.getCell(5, 3).value = 'Statut:';
  ws.getCell(5, 3).font = { name: FONT_CALIBRI, size: 10, bold: true };
  ws.getCell(5, 4).value = statusLabel(draft.status);
  ws.getCell(5, 4).font = { name: FONT_CALIBRI, size: 10 };

  let row = 7;

  // ── Produits d'exploitation ─────────────────────────────────────────────────
  writeSectionHeader(ws, row, 'Produits d\'Exploitation');
  row += 1;
  writeAmountRow(ws, row, 'Chiffre d\'affaires HT', draft.revenueHT);
  row += 1;
  writeAmountRow(ws, row, 'Total Produits d\'Exploitation', draft.revenueHT, { bold: true, total: true });
  row += 2;

  // ── Charges d'exploitation ──────────────────────────────────────────────────
  writeSectionHeader(ws, row, 'Charges d\'Exploitation');
  row += 1;
  writeAmountRow(ws, row, 'Achats Fournisseurs HT', draft.supplierExpensesHT);
  row += 1;
  writeAmountRow(ws, row, 'Charges Personnel (masse salariale)', draft.payrollTotal);
  row += 1;
  writeAmountRow(ws, row, 'Autres Charges Comptables', draft.accountingCharges);
  row += 1;
  const totalCharges = draft.supplierExpensesHT + draft.payrollTotal + draft.accountingCharges;
  writeAmountRow(ws, row, 'Total Charges d\'Exploitation', totalCharges, { bold: true, total: true });
  row += 2;

  // ── Résultat fiscal & liquidation IS ───────────────────────────────────────
  writeSectionHeader(ws, row, 'Calcul du Résultat Fiscal et Liquidation IS');
  row += 1;
  writeAmountRow(ws, row, 'Résultat Fiscal Net', draft.taxableResult, { bold: true });
  row += 1;
  writeTextRow(ws, row, 'Taux IS appliqué (barème):', appliedRateLabel(draft));
  row += 1;
  writeAmountRow(ws, row, 'Impôt sur Sociétés Calculé', draft.estimatedIS);
  row += 1;
  writeAmountRow(ws, row, 'Cotisation Minimale (0,5% CA)', draft.minimalContribution);
  row += 1;
  const cotisationMinAppliquee = draft.sourcesJson.cotisationMinimaleAppliquee === true;
  writeTextRow(ws, row, 'Cotisation minimale appliquée:', cotisationMinAppliquee ? 'Oui (impôt dû = max(IS, 0,5% CA))' : 'Non');
  row += 1;
  writeAmountRow(ws, row, 'Impôt Dû', draft.isDue, { bold: true, total: true });
  row += 2;

  const acomptesRaw = draft.sourcesJson.acomptesProvisionnels;
  if (Array.isArray(acomptesRaw) && acomptesRaw.length) {
    writeSectionHeader(ws, row, 'Acomptes Provisionnels (exercice suivant)');
    row += 1;
    for (const item of acomptesRaw) {
      const a = item as Record<string, unknown>;
      const trimestre = Number(a.trimestre ?? 0);
      const echeance = String(a.echeance ?? '');
      const montant = Number(a.montant ?? 0);
      writeAmountRow(ws, row, `T${trimestre} — échéance ${echeance}`, montant);
      row += 1;
    }
    const totalAcomptes = Number(draft.sourcesJson.totalAcomptes ?? 0);
    writeAmountRow(ws, row, 'Total acomptes provisionnels', totalAcomptes, { bold: true, total: true });
  }

  autoFitColumns(ws, COL_COUNT);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function isDeclarationExcelFilename(fiscalYear: number): string {
  return `IS_${fiscalYear}_DGI.xlsx`;
}
