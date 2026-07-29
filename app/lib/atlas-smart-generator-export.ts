/**
 * Smart Generator — PDF & Excel export (DGI-styled, company branding).
 */

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type { SmartGeneratorDocument, SmartGeneratorParams, SmartGeneratorBrandingAssets } from '@/app/types/atlas-smart-generator';
import { formatDgiIce, formatDgiIdentifiantFiscal } from '@/app/lib/atlas-tva-dgi';
import { renderPdfFirstPageToPng } from '@/app/lib/atlas-pdf-ocr-render';

const COLOR_HEADER = 'FF1B365D';
const COLOR_BORDER = 'FFD9D9D9';
const COLOR_WHITE = 'FFFFFFFF';
const FONT = 'Calibri';
const CURRENCY_FMT = '#,##0.00';

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLOR_BORDER } },
    left: { style: 'thin', color: { argb: COLOR_BORDER } },
    bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
    right: { style: 'thin', color: { argb: COLOR_BORDER } },
  };
}

function companyDisplayName(company: Partial<AtlasCompany>): string {
  return company.raisonSociale || company.legalName || company.tradeName || 'Société';
}

function companyPatent(company: Partial<AtlasCompany> & { taxeProfessionnelle?: string }): string {
  const json = company as Record<string, unknown>;
  return String(json.taxeProfessionnelle ?? json.patent ?? '');
}

type ExtendedCompany = Partial<AtlasCompany> & {
  taxeProfessionnelle?: string;
  capitalSocial?: string;
  fax?: string;
};

function companyCapital(company: ExtendedCompany): string {
  const json = company as Record<string, unknown>;
  return String(company.capitalSocial ?? json.capitalSocial ?? json.capital_social ?? '');
}

function companyFax(company: ExtendedCompany): string {
  const json = company as Record<string, unknown>;
  return String(company.fax ?? json.fax ?? '');
}

function parseLogoForJsPdf(logoBase64?: string, mimeType?: string): { format: 'PNG' | 'JPEG'; data: string } | null {
  if (!logoBase64) return null;
  if (logoBase64.startsWith('data:')) {
    const match = logoBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const fmt = match[1].toUpperCase();
    if (fmt === 'WEBP' || fmt === 'GIF') return null;
    const format = fmt === 'JPG' || fmt === 'JPEG' ? 'JPEG' : 'PNG';
    return { format, data: match[2] };
  }
  const format = mimeType?.includes('jpeg') || mimeType?.includes('jpg') ? 'JPEG' : 'PNG';
  return { format, data: logoBase64 };
}

export function smartGeneratorExportBasename(
  company: Partial<AtlasCompany>,
  docTitle: string,
): string {
  const slug = companyDisplayName(company).replace(/[^\w.-]+/g, '_').slice(0, 30) || 'Custom';
  const typeSlug = docTitle.replace(/[^\w.-]+/g, '_').slice(0, 20);
  return `SmartGen_${typeSlug}_${slug}`;
}

export async function generateSmartGeneratorExcelBuffer(
  documents: SmartGeneratorDocument[],
  company: Partial<AtlasCompany>,
  params: SmartGeneratorParams,
): Promise<Buffer> {
  const docTitle = documents[0]?.docTitle ?? 'DOCUMENT';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Synthèse Smart Generator');

  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = `${docTitle} — Génération intelligente (Maroc / DGI)`;
  title.font = { name: FONT, size: 14, bold: true, color: { argb: COLOR_WHITE } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  const meta: [string, string][] = [
    ['Société', companyDisplayName(company)],
    ['ICE', formatDgiIce(company.ice)],
    ['IF', formatDgiIdentifiantFiscal(company.if_fiscal)],
    ['RC', String(company.rc ?? '')],
    ['Patente', companyPatent(company as ExtendedCompany)],
    ['CNSS', String(company.cnss ?? '')],
    ['Capital social', companyCapital(company as ExtendedCompany)],
    ['Adresse', [company.adresse, company.ville].filter(Boolean).join(', ')],
    ['Téléphone', String(company.telephone ?? '')],
    ['Fax', companyFax(company as ExtendedCompany)],
    ['Email', String(company.email ?? '')],
    ['Période', `${params.dateDebut} → ${params.dateFin}`],
    ['Numérotation', `${params.numeroDebut} — ${params.numeroFin}`],
    ['Plafond / doc (MAD)', String(params.montantMaxParDocument)],
  ];

  let row = 3;
  for (const [label, value] of meta) {
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold: true, name: FONT, size: 10 };
    ws.getCell(`B${row}`).value = value;
    ws.getCell(`B${row}`).font = { name: FONT, size: 10 };
    row += 1;
  }

  row += 1;
  const headers = ['N° Doc', 'Client', 'Date', 'HT (MAD)', 'TVA (MAD)', 'TTC (MAD)', 'Taux TVA %', 'Lignes'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLOR_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  row += 1;

  for (const doc of documents) {
    const r = ws.getRow(row);
    r.getCell(1).value = doc.number;
    r.getCell(2).value = doc.clientName;
    r.getCell(3).value = doc.issueDate;
    r.getCell(4).value = doc.amountHT;
    r.getCell(4).numFmt = CURRENCY_FMT;
    r.getCell(5).value = doc.vatAmount;
    r.getCell(5).numFmt = CURRENCY_FMT;
    r.getCell(6).value = doc.totalTTC;
    r.getCell(6).numFmt = CURRENCY_FMT;
    r.getCell(7).value = doc.vatRatePercent;
    r.getCell(8).value = doc.lines.length;
    for (let c = 1; c <= 8; c++) r.getCell(c).border = thinBorder();
    row += 1;
  }

  const totalRow = ws.getRow(row);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(4).value = documents.reduce((s, d) => s + d.amountHT, 0);
  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  totalRow.getCell(5).value = documents.reduce((s, d) => s + d.vatAmount, 0);
  totalRow.getCell(5).numFmt = CURRENCY_FMT;
  totalRow.getCell(6).value = documents.reduce((s, d) => s + d.totalTTC, 0);
  totalRow.getCell(6).numFmt = CURRENCY_FMT;

  ws.columns = [
    { width: 14 }, { width: 28 }, { width: 12 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 10 }, { width: 8 },
  ];

  const detailWs = wb.addWorksheet('Détail lignes');
  const lineHeaders = ['N° Doc', 'Code / Réf.', 'Désignation', 'Qté', 'Unité', 'PU HT', 'Taux TVA', 'HT', 'TVA', 'TTC', 'Compte PCGE'];
  lineHeaders.forEach((h, i) => {
    const cell = detailWs.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: COLOR_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
  });

  let lr = 2;
  for (const doc of documents) {
    for (const line of doc.lines) {
      detailWs.getCell(lr, 1).value = doc.number;
      detailWs.getCell(lr, 2).value = line.reference ?? '';
      detailWs.getCell(lr, 3).value = line.description;
      detailWs.getCell(lr, 4).value = line.quantity;
      detailWs.getCell(lr, 5).value = line.unit;
      detailWs.getCell(lr, 6).value = line.unitPriceHT;
      detailWs.getCell(lr, 6).numFmt = CURRENCY_FMT;
      detailWs.getCell(lr, 7).value = line.vatRatePercent;
      detailWs.getCell(lr, 8).value = line.amountHT;
      detailWs.getCell(lr, 8).numFmt = CURRENCY_FMT;
      detailWs.getCell(lr, 9).value = line.vatAmount;
      detailWs.getCell(lr, 9).numFmt = CURRENCY_FMT;
      detailWs.getCell(lr, 10).value = line.totalTTC;
      detailWs.getCell(lr, 10).numFmt = CURRENCY_FMT;
      detailWs.getCell(lr, 11).value = line.pcgeAccount ?? '';
      lr += 1;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export async function generateSmartGeneratorPdfBuffer(
  documents: SmartGeneratorDocument[],
  company: ExtendedCompany,
  branding?: SmartGeneratorBrandingAssets | null,
): Promise<Buffer> {
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let headerBgBase64: string | null = null;
  if (branding?.headerPdfBase64) {
    try {
      const pdfBytes = Buffer.from(branding.headerPdfBase64, 'base64');
      const pngBuf = await renderPdfFirstPageToPng(pdfBytes);
      headerBgBase64 = pngBuf.toString('base64');
    } catch {
      headerBgBase64 = null;
    }
  }

  const logoImage = parseLogoForJsPdf(branding?.logoBase64, branding?.logoMimeType);

  for (let idx = 0; idx < documents.length; idx++) {
    if (idx > 0) doc.addPage();

    const item = documents[idx]!;
    const docLabel = item.docTitle;
    let contentStartY = 54;

    if (headerBgBase64) {
      doc.addImage(`data:image/png;base64,${headerBgBase64}`, 'PNG', 0, 0, 210, 45);
      contentStartY = 50;
    } else {
      doc.setFillColor(27, 54, 93);
      doc.rect(0, 0, 210, 32, 'F');

      if (logoImage) {
        try {
          doc.addImage(logoImage.data, logoImage.format, 14, 4, 22, 22);
        } catch {
          /* ignore invalid logo */
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      const nameX = logoImage ? 40 : 14;
      doc.text(companyDisplayName(company), nameX, 12);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const ids = [
        company.ice ? `ICE: ${formatDgiIce(company.ice)}` : null,
        company.if_fiscal ? `IF: ${formatDgiIdentifiantFiscal(company.if_fiscal)}` : null,
        company.rc ? `RC: ${company.rc}` : null,
        companyPatent(company) ? `Patente: ${companyPatent(company)}` : null,
        company.cnss ? `CNSS: ${company.cnss}` : null,
        companyCapital(company) ? `Capital: ${companyCapital(company)}` : null,
      ].filter(Boolean).join(' · ');
      if (ids) doc.text(ids, nameX, 18, { maxWidth: 130 });
      const addr = [company.adresse, company.ville].filter(Boolean).join(', ');
      if (addr) doc.text(addr, nameX, 24, { maxWidth: 130 });
      const contact = [
        company.telephone ? `Tél: ${company.telephone}` : null,
        companyFax(company) ? `Fax: ${companyFax(company)}` : null,
        company.email ? company.email : null,
      ].filter(Boolean).join(' · ');
      if (contact) doc.text(contact, nameX, 29, { maxWidth: 130 });
    }

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(docLabel, 196, headerBgBase64 ? 38 : 12, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`N° ${item.number}`, 196, headerBgBase64 ? 43 : 18, { align: 'right' });
    doc.text(`Date: ${item.issueDate}`, 196, headerBgBase64 ? 47 : 23, { align: 'right' });
    if (item.dueDate && item.docType === 'facture') {
      doc.text(`Échéance: ${item.dueDate}`, 196, headerBgBase64 ? 51 : 28, { align: 'right' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Client / Destinataire', 14, contentStartY - 6);
    doc.setFont('helvetica', 'normal');
    doc.text(item.clientName, 14, contentStartY);

    autoTable(doc, {
      startY: contentStartY + 6,
      head: [['Code / Réf.', 'Désignation', 'Qté', 'Unité', 'PU HT', 'TVA %', 'HT', 'TVA', 'TTC', 'PCGE']],
      body: item.lines.map((l) => [
        l.reference ?? '',
        l.description,
        String(l.quantity),
        l.unit,
        l.unitPriceHT.toFixed(2),
        String(l.vatRatePercent),
        l.amountHT.toFixed(2),
        l.vatAmount.toFixed(2),
        l.totalTTC.toFixed(2),
        l.pcgeAccount ?? '',
      ]),
      headStyles: { fillColor: [27, 54, 93], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });

    let y = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? contentStartY + 6) + 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total HT: ${item.amountHT.toFixed(2)} MAD`, 140, y);
    y += 6;
    doc.text(`Total TVA: ${item.vatAmount.toFixed(2)} MAD`, 140, y);
    y += 6;
    doc.setFontSize(11);
    doc.text(`Total TTC: ${item.totalTTC.toFixed(2)} MAD`, 140, y);

    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text('Document généré par Zafirix Smart Generator — Conforme PCGE / DGI Maroc', 14, 287);
  }

  return Buffer.from(doc.output('arraybuffer'));
}
