import ExcelJS from 'exceljs';
import type { Etat9421Data } from '@/app/types/atlas-ir-export';
import type { AtlasIrExportCompanyInfo } from '@/app/lib/atlas-ir-server';
import { validateEtat9421ForExport } from '@/app/lib/atlas-ir-server';

const COLOR_HEADER = 'FF1B365D';
const COLOR_SECTION = 'FF0F2C59';
const FONT = 'Calibri';
const CURRENCY_FMT = '#,##0.00';

function headerFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
}

function sectionFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SECTION } };
}

export async function generateEtat9421ExcelBuffer(
  data: Etat9421Data,
  company: AtlasIrExportCompanyInfo,
): Promise<Buffer> {
  const validation = validateEtat9421ForExport(data);
  if (!validation.ok) throw new Error(validation.message ?? validation.error ?? 'export_invalid');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zafirix Pro';
  const ws = wb.addWorksheet('État 9421');

  ws.mergeCells(1, 1, 1, 10);
  const title = ws.getCell(1, 1);
  title.value = 'ÉTAT 9421 — ANNUEL DES TRAITEMENTS ET SALAIRES (DGI SIMPL-IR)';
  title.font = { name: FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = headerFill();
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  const raisonSociale = company.trade_name?.trim() || company.legal_name?.trim() || company.name?.trim() || data.raisonSociale;
  ws.getCell(3, 1).value = 'Société:';
  ws.getCell(3, 1).font = { bold: true, name: FONT, size: 10 };
  ws.mergeCells(3, 2, 3, 5);
  ws.getCell(3, 2).value = raisonSociale;

  ws.getCell(4, 1).value = 'IF:';
  ws.getCell(4, 1).font = { bold: true, name: FONT, size: 10 };
  ws.getCell(4, 2).value = data.identifiantFiscal;
  ws.getCell(4, 3).value = 'ICE:';
  ws.getCell(4, 3).font = { bold: true, name: FONT, size: 10 };
  ws.getCell(4, 4).value = data.ice;

  ws.getCell(5, 1).value = 'Exercice:';
  ws.getCell(5, 1).font = { bold: true, name: FONT, size: 10 };
  ws.getCell(5, 2).value = `${data.fiscalYear} (${data.periodeDu} → ${data.periodeAu})`;

  let row = 7;
  ws.mergeCells(row, 1, row, 10);
  ws.getCell(row, 1).value = 'DÉTAIL PAR SALARIÉ';
  ws.getCell(row, 1).fill = sectionFill();
  ws.getCell(row, 1).font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  row += 1;

  const headers = [
    'Nom',
    'CIN',
    'Matricule CNSS',
    'Mois payés',
    'Brut annuel',
    'CNSS sal.',
    'AMO sal.',
    'IR retenu',
    'Net annuel',
    'CNSS pat.',
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { name: FONT, size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF4' } };
  });
  row += 1;

  for (const e of data.employees) {
    ws.getRow(row).values = [
      e.nom,
      e.cin ?? '',
      e.cnssMatricule ?? '',
      e.moisPayes,
      e.salaireBrutAnnuel,
      e.cnssSalarialAnnuel,
      e.amoSalarialAnnuel,
      e.irAnnuel,
      e.salaireNetAnnuel,
      e.cnssPatronalAnnuel,
    ];
    for (let c = 5; c <= 10; c += 1) {
      ws.getCell(row, c).numFmt = CURRENCY_FMT;
    }
    row += 1;
  }

  row += 1;
  ws.mergeCells(row, 1, row, 10);
  ws.getCell(row, 1).value = 'TOTAUX ANNUELS';
  ws.getCell(row, 1).fill = sectionFill();
  ws.getCell(row, 1).font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  row += 1;

  const totalRows: [string, number][] = [
    ['Total brut annuel', data.totals.totalBrut],
    ['Total CNSS salarial', data.totals.totalCnssSalarial],
    ['Total AMO salarial', data.totals.totalAmoSalarial],
    ['Total IR retenu', data.totals.totalIr],
    ['Total net annuel', data.totals.totalNet],
    ['Total CNSS patronal', data.totals.totalCnssPatronal],
    ['Total AMO patronal', data.totals.totalAmoPatronal],
  ];
  for (const [label, amount] of totalRows) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: FONT, size: 10, bold: true };
    ws.getCell(row, 2).value = amount;
    ws.getCell(row, 2).numFmt = CURRENCY_FMT;
    ws.getCell(row, 3).value = 'MAD';
    row += 1;
  }

  ws.columns.forEach((col) => {
    col.width = 16;
  });
  ws.getColumn(1).width = 24;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function etat9421ExcelFilename(fiscalYear: number): string {
  return `Etat9421_${fiscalYear}_DGI.xlsx`;
}
