/**
 * Server-side export for bank operations (Excel / CSV).
 */

import ExcelJS from 'exceljs';

export type BankExportTransaction = {
  transactionDate: string | null;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  reconciliations: { status: string }[];
};

export type BankExportRow = {
  date: string;
  libelleReference: string;
  debit: number | null;
  credit: number | null;
  reconStatus: string;
};

const CURRENCY_FMT = '#,##0.00';
const FONT_CALIBRI = 'Calibri';
const COLOR_HEADER = 'FF1F497D';
const COLOR_WHITE = 'FFFFFFFF';

export function bankReconStatusLabel(reconciliations: { status: string }[]): string {
  const statuses = reconciliations.map(r => r.status);
  if (statuses.includes('matched')) return 'Rapproché';
  if (statuses.includes('suggested')) return 'Suggéré';
  return 'Non rapproché';
}

export function bankReconTone(reconciliations: { status: string }[]): 'matched' | 'suggested' | 'unmatched' {
  const statuses = reconciliations.map(r => r.status);
  if (statuses.includes('matched')) return 'matched';
  if (statuses.includes('suggested')) return 'suggested';
  return 'unmatched';
}

function libelleReference(description: string | null, reference: string | null): string {
  const desc = description?.trim() ?? '';
  const ref = reference?.trim() ?? '';
  if (desc && ref) return `${desc} (${ref})`;
  return desc || ref || '—';
}

export function buildBankExportRows(transactions: BankExportTransaction[]): BankExportRow[] {
  return transactions.map(tx => ({
    date: tx.transactionDate ?? '',
    libelleReference: libelleReference(tx.description, tx.reference),
    debit: tx.debit > 0 ? tx.debit : null,
    credit: tx.credit > 0 ? tx.credit : null,
    reconStatus: bankReconStatusLabel(tx.reconciliations),
  }));
}

export function sanitizeExportFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'Societe';
}

export function bankExportFilename(companyName: string, year: number, ext: 'xlsx' | 'csv'): string {
  const safeName = sanitizeExportFilenamePart(companyName);
  return `Operations_Bancaires_${safeName}_${year}.${ext}`;
}

function formatMadCsv(n: number | null): string {
  if (n == null || n <= 0) return '';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildBankExportCsv(rows: BankExportRow[]): string {
  const header = ['Date', 'Libellé / Référence', 'Débit (MAD)', 'Crédit (MAD)', 'Statut Rapprochement'];
  const lines = [
    header.join(';'),
    ...rows.map(r => [
      r.date,
      `"${r.libelleReference.replace(/"/g, '""')}"`,
      formatMadCsv(r.debit),
      formatMadCsv(r.credit),
      r.reconStatus,
    ].join(';')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export async function buildBankExportExcelBuffer(rows: BankExportRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zafirix Pro';
  wb.created = new Date();

  const ws = wb.addWorksheet('Opérations bancaires');
  ws.columns = [
    { key: 'date', width: 14 },
    { key: 'libelleReference', width: 42 },
    { key: 'debit', width: 16 },
    { key: 'credit', width: 16 },
    { key: 'reconStatus', width: 20 },
  ];

  ws.mergeCells(1, 1, 1, 5);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: FONT_CALIBRI, size: 13, bold: true, color: { argb: COLOR_WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  const headers = ['Date', 'Libellé / Référence', 'Débit (MAD)', 'Crédit (MAD)', 'Statut Rapprochement'];
  const headerRow = ws.getRow(3);
  headers.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { name: FONT_CALIBRI, size: 10, bold: true, color: { argb: COLOR_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 20;

  rows.forEach((row, index) => {
    const excelRow = ws.getRow(4 + index);
    excelRow.getCell(1).value = row.date;
    excelRow.getCell(2).value = row.libelleReference;
    excelRow.getCell(3).value = row.debit ?? '';
    excelRow.getCell(4).value = row.credit ?? '';
    excelRow.getCell(5).value = row.reconStatus;

    excelRow.getCell(1).font = { name: FONT_CALIBRI, size: 10 };
    excelRow.getCell(2).font = { name: FONT_CALIBRI, size: 10 };
    excelRow.getCell(5).font = { name: FONT_CALIBRI, size: 10 };

    if (row.debit != null) {
      excelRow.getCell(3).numFmt = CURRENCY_FMT;
      excelRow.getCell(3).font = { name: FONT_CALIBRI, size: 10, color: { argb: 'FFB91C1C' } };
    }
    if (row.credit != null) {
      excelRow.getCell(4).numFmt = CURRENCY_FMT;
      excelRow.getCell(4).font = { name: FONT_CALIBRI, size: 10, color: { argb: 'FF15803D' } };
    }
  });

  ws.views = [{ state: 'frozen', ySplit: 3 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
