'use client';

/**
 * Client-side multi-format export for sales invoices (Factures module).
 */

import type { ExportFormat } from '@/app/lib/atlas-export-engine';
import type { AtlasCompany } from '@/app/types/atlas-company';

export type InvoiceExportRow = {
  numero: string;
  client: string;
  date: string;
  echeance: string;
  montantHT: number;
  tva: number;
  ttc: number;
  paye: number;
  reste: number;
  statut: string;
};

function invoiceFilename(numero: string, ext: string): string {
  return `facture-${numero}`.replace(/[^\w.-]+/g, '_') + `.${ext}`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function invoiceXml(row: InvoiceExportRow, company?: Partial<AtlasCompany> | null): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ZafirixInvoice xmlns="https://zafirixpro.com/schema/invoice/v1">
  <Meta generatedBy="zafirix_pro" exportedAt="${new Date().toISOString()}" />
  <Emitter>${esc(String(company?.raisonSociale ?? 'ZAFIRIX PRO'))}</Emitter>
  <Invoice number="${esc(row.numero)}" status="${esc(row.statut)}">
    <Client>${esc(row.client)}</Client>
    <IssueDate>${esc(row.date)}</IssueDate>
    <DueDate>${esc(row.echeance)}</DueDate>
    <AmountHT currency="MAD">${row.montantHT}</AmountHT>
    <TVA currency="MAD">${row.tva}</TVA>
    <AmountTTC currency="MAD">${row.ttc}</AmountTTC>
    <Paid currency="MAD">${row.paye}</Paid>
    <Balance currency="MAD">${row.reste}</Balance>
  </Invoice>
</ZafirixInvoice>`;
}

export async function exportInvoiceFormat(
  row: InvoiceExportRow,
  format: ExportFormat,
  company?: Partial<AtlasCompany> | null,
  onDownloadPdf?: () => void | Promise<void>,
): Promise<void> {
  switch (format) {
    case 'pdf':
      if (onDownloadPdf) await onDownloadPdf();
      return;
    case 'xml': {
      const xml = invoiceXml(row, company);
      triggerBlobDownload(new Blob([xml], { type: 'application/xml' }), invoiceFilename(row.numero, 'xml'));
      return;
    }
    case 'xlsx': {
      const { utils, write } = await import('xlsx');
      const wb = utils.book_new();
      const data = [
        ['Champ', 'Valeur'],
        ['N° Facture', row.numero],
        ['Client', row.client],
        ['Date émission', row.date],
        ['Échéance', row.echeance],
        ['Montant HT (MAD)', row.montantHT],
        ['TVA (MAD)', row.tva],
        ['TTC (MAD)', row.ttc],
        ['Payé (MAD)', row.paye],
        ['Reste (MAD)', row.reste],
        ['Statut', row.statut],
        ['Société', company?.raisonSociale ?? ''],
      ];
      utils.book_append_sheet(wb, utils.aoa_to_sheet(data), 'Facture');
      const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      triggerBlobDownload(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        invoiceFilename(row.numero, 'xlsx'),
      );
      return;
    }
    case 'docx': {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
      const lines = [
        new Paragraph({ text: 'FACTURE', heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: company?.raisonSociale ?? 'ZAFIRIX PRO', bold: true })] }),
        new Paragraph({ text: `N° ${row.numero}` }),
        new Paragraph({ text: `Client : ${row.client}` }),
        new Paragraph({ text: `Émission : ${row.date} · Échéance : ${row.echeance}` }),
        new Paragraph({ text: `HT : ${row.montantHT.toLocaleString('fr-MA')} MAD` }),
        new Paragraph({ text: `TVA : ${row.tva.toLocaleString('fr-MA')} MAD` }),
        new Paragraph({ text: `TTC : ${row.ttc.toLocaleString('fr-MA')} MAD` }),
        new Paragraph({ text: `Statut : ${row.statut}` }),
      ];
      const doc = new Document({ sections: [{ children: lines }] });
      const buf = await Packer.toBlob(doc);
      triggerBlobDownload(buf, invoiceFilename(row.numero, 'docx'));
      return;
    }
    default:
      return;
  }
}

export const INVOICE_EXPORT_FORMATS: ExportFormat[] = ['pdf', 'xlsx', 'docx', 'xml'];
