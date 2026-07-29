/**
 * Documents IA export engine.
 * Produces JSON, CSV, XML, XLSX representations of a document with full traceability.
 * Every exported record includes source_document_id, generated_by, confidence scores.
 */

import type { AtlasDocument, AtlasStructuredExtraction, AtlasDocumentClassification } from '@/app/types/atlas-document';
import { structuredExtractionFromDocument, classificationFromDocument, validationStatusFromDocument, documentTypeFromDocument } from '@/app/lib/atlas-documents-repository';

// ── Shared data builder ───────────────────────────────────────────────────────

export type DocumentExportPayload = {
  meta: {
    source_document_id: string;
    filename: string;
    document_type: string;
    validation_status: string;
    generated_by: 'documents_ia';
    exported_at: string;
  };
  classification: AtlasDocumentClassification | null;
  extraction: AtlasStructuredExtraction | Record<string, unknown>;
  corrections: unknown[];
  events: unknown[];
};

function fieldValue(field: { value?: string | number | null; user_corrected_value?: string } | null | undefined): string {
  if (!field) return '';
  if (field.user_corrected_value != null) return String(field.user_corrected_value);
  return field.value != null ? String(field.value) : '';
}

function fieldConf(field: { confidence?: number | null } | null | undefined): string {
  if (!field?.confidence) return '';
  return `${Math.round(field.confidence * 100)}%`;
}

export function buildDocumentExportPayload(doc: AtlasDocument): DocumentExportPayload {
  const classification = classificationFromDocument(doc);
  const extraction = structuredExtractionFromDocument(doc);
  const validationStatus = validationStatusFromDocument(doc);
  const documentType = documentTypeFromDocument(doc);

  const meta = doc.metadata as Record<string, unknown> | null;
  const corrections: unknown[] = Array.isArray(meta?.corrections) ? meta.corrections as unknown[] : [];
  const events: unknown[] = Array.isArray(meta?.events) ? meta.events as unknown[] : [];

  return {
    meta: {
      source_document_id: String(doc.id),
      filename: doc.filename ?? '',
      document_type: documentType ?? 'unknown',
      validation_status: validationStatus ?? 'pending_review',
      generated_by: 'documents_ia',
      exported_at: new Date().toISOString(),
    },
    classification: classification ?? null,
    extraction: extraction ?? {},
    corrections,
    events,
  };
}

// ── JSON export ───────────────────────────────────────────────────────────────

export function exportToJson(doc: AtlasDocument): string {
  const payload = buildDocumentExportPayload(doc);
  return JSON.stringify(payload, null, 2);
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCsv(doc: AtlasDocument): string {
  const payload = buildDocumentExportPayload(doc);
  const ext = payload.extraction as AtlasStructuredExtraction;

  const rows: string[][] = [
    ['Champ', 'Valeur', 'Confiance', 'Source Page', 'Valeur Originale IA', 'Valeur Corrigée', 'Vérifié'],
  ];

  const FIELDS: Array<[keyof AtlasStructuredExtraction, string]> = [
    ['supplier_name', 'Fournisseur'],
    ['supplier_ice', 'ICE'],
    ['supplier_if', 'IF'],
    ['supplier_rc', 'RC'],
    ['supplier_address', 'Adresse fournisseur'],
    ['invoice_number', 'N° Facture'],
    ['invoice_date', 'Date facture'],
    ['due_date', 'Date échéance'],
    ['subtotal_ht', 'Montant HT'],
    ['tva_amount', 'TVA'],
    ['tva_rate', 'Taux TVA'],
    ['total_ttc', 'Montant TTC'],
    ['currency', 'Devise'],
    ['payment_method', 'Mode de paiement'],
    ['customer_name', 'Client'],
    ['category_suggestion', 'Catégorie'],
    ['accounting_account', 'Compte comptable'],
  ];

  for (const [key, label] of FIELDS) {
    const f = ext[key] as { value?: unknown; confidence?: number; source_page?: number; raw_value?: unknown; user_corrected_value?: string; user_verified?: boolean } | undefined;
    if (!f) continue;
    rows.push([
      label,
      fieldValue(f as Parameters<typeof fieldValue>[0]),
      fieldConf(f as Parameters<typeof fieldConf>[0]),
      f.source_page != null ? String(f.source_page) : '',
      f.raw_value != null ? String(f.raw_value) : '',
      f.user_corrected_value ?? '',
      f.user_verified ? 'Oui' : 'Non',
    ]);
  }

  // Meta section
  rows.push([]);
  rows.push(['# MÉTADONNÉES']);
  rows.push(['ID Document', String(doc.id), '', '', '', '', '']);
  rows.push(['Type', payload.meta.document_type, '', '', '', '', '']);
  rows.push(['Statut validation', payload.meta.validation_status, '', '', '', '', '']);
  if (payload.classification) {
    const cls = payload.classification as AtlasDocumentClassification;
    rows.push(['Confiance classification', fieldConf({ confidence: cls.type_confidence }), '', '', '', '', '']);
  }
  rows.push(['Exporté le', payload.meta.exported_at, '', '', '', '', '']);

  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

// ── XML export ────────────────────────────────────────────────────────────────

function xmlEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlField(tag: string, field: { value?: string | number | null; confidence?: number | null; source_page?: number | null; user_corrected_value?: string; user_verified?: boolean } | undefined): string {
  if (!field) return '';
  const val = field.user_corrected_value ?? field.value;
  if (val == null && field.confidence == null) return '';
  let attrs = '';
  if (field.confidence != null) attrs += ` confidence="${Math.round(field.confidence * 100)}"`;
  if (field.source_page != null) attrs += ` source_page="${field.source_page}"`;
  if (field.user_corrected_value != null) attrs += ` corrected="true"`;
  if (field.user_verified === true) attrs += ` verified="true"`;
  return `    <${tag}${attrs}>${xmlEscape(val)}</${tag}>`;
}

export function exportToXml(doc: AtlasDocument): string {
  const payload = buildDocumentExportPayload(doc);
  const ext = payload.extraction as AtlasStructuredExtraction;
  const cls = payload.classification;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ZafirixDocument xmlns:zafirix="https://zafirix.pro/schema/v1">',
    '  <Meta>',
    `    <SourceDocumentId>${xmlEscape(payload.meta.source_document_id)}</SourceDocumentId>`,
    `    <Filename>${xmlEscape(payload.meta.filename)}</Filename>`,
    `    <DocumentType>${xmlEscape(payload.meta.document_type)}</DocumentType>`,
    `    <ValidationStatus>${xmlEscape(payload.meta.validation_status)}</ValidationStatus>`,
    `    <GeneratedBy>${xmlEscape(payload.meta.generated_by)}</GeneratedBy>`,
    `    <ExportedAt>${xmlEscape(payload.meta.exported_at)}</ExportedAt>`,
    '  </Meta>',
  ];

  if (cls) {
    lines.push('  <Classification>');
    lines.push(`    <Type confidence="${Math.round((cls.type_confidence ?? 0) * 100)}">${xmlEscape(cls.detected_type)}</Type>`);
    if (cls.classification_reason) lines.push(`    <Reason>${xmlEscape(cls.classification_reason)}</Reason>`);
    if (cls.detected_language) lines.push(`    <Language>${xmlEscape(cls.detected_language)}</Language>`);
    if (cls.detected_currency) lines.push(`    <Currency>${xmlEscape(cls.detected_currency)}</Currency>`);
    if (cls.detected_country) lines.push(`    <Country>${xmlEscape(cls.detected_country)}</Country>`);
    lines.push('  </Classification>');
  }

  lines.push('  <Extraction>');
  lines.push('    <Supplier>');
  const supFields: Array<[keyof AtlasStructuredExtraction, string]> = [
    ['supplier_name', 'Name'], ['supplier_ice', 'ICE'], ['supplier_if', 'IF'],
    ['supplier_rc', 'RC'], ['supplier_address', 'Address'],
  ];
  for (const [k, t] of supFields) {
    const f = ext[k] as Parameters<typeof xmlField>[1];
    const line = xmlField(t, f);
    if (line) lines.push('  ' + line);
  }
  lines.push('    </Supplier>');

  lines.push('    <Invoice>');
  const invFields: Array<[keyof AtlasStructuredExtraction, string]> = [
    ['invoice_number', 'Number'], ['invoice_date', 'Date'], ['due_date', 'DueDate'],
    ['subtotal_ht', 'AmountHT'], ['tva_amount', 'TVAAmount'], ['tva_rate', 'TVARate'],
    ['total_ttc', 'TotalTTC'], ['currency', 'Currency'], ['payment_method', 'PaymentMethod'],
  ];
  for (const [k, t] of invFields) {
    const f = ext[k] as Parameters<typeof xmlField>[1];
    const line = xmlField(t, f);
    if (line) lines.push('  ' + line);
  }
  lines.push('    </Invoice>');

  if (Array.isArray(ext.line_items) && ext.line_items.length > 0) {
    lines.push('    <LineItems>');
    for (const item of ext.line_items) {
      lines.push(`      <Item description="${xmlEscape((item as Record<string, unknown>).description)}" quantity="${xmlEscape((item as Record<string, unknown>).quantity)}" unit_price="${xmlEscape((item as Record<string, unknown>).unit_price)}" total="${xmlEscape((item as Record<string, unknown>).total)}" />`);
    }
    lines.push('    </LineItems>');
  }

  lines.push('  </Extraction>');
  lines.push('</ZafirixDocument>');

  return lines.join('\n');
}

// ── XLSX export ───────────────────────────────────────────────────────────────

export async function exportToXlsx(doc: AtlasDocument): Promise<Buffer> {
  const { utils, write } = await import('xlsx');
  const payload = buildDocumentExportPayload(doc);
  const ext = payload.extraction as AtlasStructuredExtraction;

  const wb = utils.book_new();

  // Sheet 1: Summary
  const summaryData = [
    ['Zafirix Pro — Documents IA Export'],
    [''],
    ['ID Document', payload.meta.source_document_id],
    ['Fichier', payload.meta.filename],
    ['Type', payload.meta.document_type],
    ['Statut validation', payload.meta.validation_status],
    ['Exporté le', payload.meta.exported_at],
  ];
  if (payload.classification) {
    const cls = payload.classification as AtlasDocumentClassification;
    summaryData.push(['Confiance classification', `${Math.round((cls.type_confidence ?? 0) * 100)}%`]);
    summaryData.push(['Langue détectée', cls.detected_language ?? '']);
    summaryData.push(['Devise', cls.detected_currency ?? '']);
  }
  const wsSummary = utils.aoa_to_sheet(summaryData);
  utils.book_append_sheet(wb, wsSummary, 'Résumé');

  // Sheet 2: Extracted fields
  const extractionRows: unknown[][] = [
    ['Champ', 'Valeur', 'Confiance', 'Page Source', 'Valeur Brute IA', 'Valeur Corrigée', 'Vérifié'],
  ];

  const FIELDS: Array<[keyof AtlasStructuredExtraction, string]> = [
    ['supplier_name', 'Fournisseur'], ['supplier_ice', 'ICE'], ['supplier_if', 'IF'],
    ['supplier_rc', 'RC'], ['supplier_address', 'Adresse fournisseur'],
    ['invoice_number', 'N° Facture'], ['invoice_date', 'Date facture'], ['due_date', 'Échéance'],
    ['subtotal_ht', 'Montant HT'], ['tva_amount', 'TVA'], ['tva_rate', 'Taux TVA'],
    ['total_ttc', 'Total TTC'], ['currency', 'Devise'], ['payment_method', 'Mode paiement'],
    ['customer_name', 'Client'], ['category_suggestion', 'Catégorie'],
    ['accounting_account', 'Compte comptable'],
  ];

  for (const [key, label] of FIELDS) {
    const f = ext[key] as { value?: unknown; confidence?: number; source_page?: number; raw_value?: unknown; user_corrected_value?: string; user_verified?: boolean } | undefined;
    if (!f) continue;
    extractionRows.push([
      label,
      fieldValue(f as Parameters<typeof fieldValue>[0]),
      f.confidence != null ? Math.round(f.confidence * 100) / 100 : '',
      f.source_page ?? '',
      f.raw_value ?? '',
      f.user_corrected_value ?? '',
      f.user_verified ? 'Oui' : 'Non',
    ]);
  }

  const wsExtraction = utils.aoa_to_sheet(extractionRows);
  wsExtraction['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 8 }];
  utils.book_append_sheet(wb, wsExtraction, 'Extraction');

  // Sheet 3: Line items (if any)
  if (Array.isArray(ext.line_items) && ext.line_items.length > 0) {
    const lineData: unknown[][] = [['Description', 'Quantité', 'Prix Unitaire', 'Total', 'TVA']];
    for (const item of ext.line_items) {
      const i = item as Record<string, unknown>;
      lineData.push([i.description ?? '', i.quantity ?? '', i.unit_price ?? '', i.total ?? '', i.tax ?? '']);
    }
    const wsLines = utils.aoa_to_sheet(lineData);
    utils.book_append_sheet(wb, wsLines, 'Lignes');
  }

  const buffer = write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buffer;
}

// ── Word (.docx) export ─────────────────────────────────────────────────────

export async function exportToDocx(doc: AtlasDocument): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const payload = buildDocumentExportPayload(doc);
  const ext = payload.extraction as Record<string, { value?: unknown; user_corrected_value?: string } | undefined>;

  const lines = [
    new Paragraph({ text: 'ZAFIRIX PRO — Export Document', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: payload.meta.filename, bold: true, size: 28 })] }),
    new Paragraph({ text: `Type : ${payload.meta.document_type}` }),
    new Paragraph({ text: `Statut : ${payload.meta.validation_status}` }),
    new Paragraph({ text: `Exporté le : ${payload.meta.exported_at}` }),
    new Paragraph({ text: 'Extraction des champs', heading: HeadingLevel.HEADING_2 }),
  ];

  const FIELDS: Array<[string, string]> = [
    ['supplier_name', 'Fournisseur'],
    ['supplier_ice', 'ICE'],
    ['invoice_number', 'N° Facture'],
    ['invoice_date', 'Date'],
    ['subtotal_ht', 'Montant HT'],
    ['tva_amount', 'TVA'],
    ['total_ttc', 'Total TTC'],
    ['currency', 'Devise'],
  ];

  for (const [key, label] of FIELDS) {
    const f = ext[key];
    const value = f ? fieldValue(f as Parameters<typeof fieldValue>[0]) : '';
    if (!value) continue;
    lines.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${label} : `, bold: true }),
          new TextRun({ text: value }),
        ],
      }),
    );
  }

  lines.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({ text: 'Document généré par Zafirix Pro — Documents IA', italics: true, size: 18 })],
    }),
  );

  const wordDoc = new Document({ sections: [{ children: lines }] });
  return Packer.toBuffer(wordDoc);
}

// ── ZIP export ────────────────────────────────────────────────────────────────

export async function exportToZip(doc: AtlasDocument): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const base = (doc.filename ?? 'document').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);

  // Gather all formats
  const [jsonStr, csvStr, xmlStr, xlsxBuf, docxBuf] = await Promise.all([
    exportToJson(doc),
    exportToCsv(doc),
    exportToXml(doc),
    exportToXlsx(doc),
    exportToDocx(doc),
  ]);

  zip.file(`${base}_${date}.json`, jsonStr);
  zip.file(`${base}_${date}.csv`, csvStr);
  zip.file(`${base}_${date}.xml`, xmlStr);
  zip.file(`${base}_${date}.xlsx`, xlsxBuf);
  zip.file(`${base}_${date}.docx`, docxBuf);

  // README
  const payload = buildDocumentExportPayload(doc);
  const readme = [
    `Zafirix Pro — Documents IA Export`,
    ``,
    `Document  : ${payload.meta.filename}`,
    `ID        : ${payload.meta.source_document_id}`,
    `Type      : ${payload.meta.document_type}`,
    `Statut    : ${payload.meta.validation_status}`,
    `Exporté le: ${payload.meta.exported_at}`,
    ``,
    `Contenu de ce ZIP :`,
    `  *.json  — données complètes (classification, extraction, corrections)`,
    `  *.csv   — champs extraits tabulaires`,
    `  *.xml   — format structuré XML (ZafirixDocument v1)`,
    `  *.xlsx  — classeur Excel multi-feuilles`,
    `  *.docx  — document Word éditable`,
    ``,
    `Généré par Zafirix Pro — Documents IA`,
  ].join('\n');
  zip.file('README.txt', readme);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) as Promise<Buffer>;
}

// ── Filename helpers ──────────────────────────────────────────────────────────

export function exportFilename(doc: AtlasDocument, format: string): string {
  const base = (doc.filename ?? 'document').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40);
  const dateStr = new Date().toISOString().slice(0, 10);
  const ext =
    format === 'xlsx'
      ? 'xlsx'
      : format === 'docx'
        ? 'docx'
        : format === 'json'
          ? 'json'
          : format === 'csv'
            ? 'csv'
            : format === 'xml'
              ? 'xml'
              : format === 'zip'
                ? 'zip'
                : format === 'pdf'
                  ? 'pdf'
                  : format;
  return `zafirix_${base}_${dateStr}.${ext}`;
}
