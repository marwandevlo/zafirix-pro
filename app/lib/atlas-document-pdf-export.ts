/**
 * Documents IA — PDF Export (server-side, Node.js + jsPDF).
 * Produces a branded, structured PDF containing:
 *   - Company header
 *   - Document metadata
 *   - Classification
 *   - Extracted fields (with confidence + correction markers)
 *   - Line items table
 *   - Corrections log
 *   - Validation status + footer
 */

import { jsPDF } from 'jspdf';
import type { AtlasDocument, AtlasStructuredExtraction, AtlasDocumentClassification } from '@/app/types/atlas-document';
import type { AtlasCompany } from '@/app/types/atlas-company';
import { structuredExtractionFromDocument, classificationFromDocument, validationStatusFromDocument, documentTypeFromDocument } from '@/app/lib/atlas-documents-repository';

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND_RED = [239, 68, 68] as const;
const GRAY_100  = [243, 244, 246] as const;
const GRAY_200  = [229, 231, 235] as const;
const GRAY_400  = [156, 163, 175] as const;
const GRAY_700  = [55, 65, 81] as const;
const GRAY_800  = [31, 41, 55] as const;
const GREEN_600 = [22, 163, 74] as const;
const AMBER_600 = [217, 119, 6] as const;
const RED_600   = [220, 38, 38] as const;
const WHITE     = [255, 255, 255] as const;

const PAGE_W  = 210;   // A4 mm width
const MARGIN  = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAGE_H  = 297;
const FOOTER_H = 16;

// ── Helper types ──────────────────────────────────────────────────────────────

type PdfState = { doc: jsPDF; y: number; page: number };

function extractedField(ext: AtlasStructuredExtraction, key: keyof AtlasStructuredExtraction) {
  const f = ext[key] as { value?: unknown; confidence?: number; user_corrected_value?: string; source_page?: number } | undefined;
  if (!f) return null;
  const displayValue = f.user_corrected_value != null ? String(f.user_corrected_value) : (f.value != null ? String(f.value) : '');
  return {
    displayValue,
    confidence: f.confidence ?? null,
    corrected: f.user_corrected_value != null,
    sourcePage: f.source_page ?? null,
  };
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function setFont(doc: jsPDF, style: 'normal' | 'bold', size: number, color: readonly number[] = GRAY_800) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, color: readonly number[]) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.rect(x, y, w, h, 'F');
}

function drawLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, color: readonly number[] = GRAY_200, lw = 0.25) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(lw);
  doc.line(x1, y1, x2, y2);
}

function checkNewPage(state: PdfState, neededMm = 12) {
  if (state.y + neededMm > PAGE_H - FOOTER_H - 4) {
    addFooter(state);
    state.doc.addPage();
    state.page++;
    state.y = MARGIN;
  }
}

function addFooter(state: PdfState) {
  const { doc, page } = state;
  const y = PAGE_H - FOOTER_H;
  fillRect(doc, 0, y, PAGE_W, FOOTER_H, GRAY_100);
  setFont(doc, 'normal', 7, GRAY_400);
  doc.text('Zafirix Pro — Documents IA', MARGIN, y + 6);
  doc.text(`Page ${page}`, PAGE_W - MARGIN, y + 6, { align: 'right' });
  doc.text('Document confidentiel — généré automatiquement', PAGE_W / 2, y + 6, { align: 'center' });
}

// ── Sections ──────────────────────────────────────────────────────────────────

function addHeader(state: PdfState, doc: AtlasDocument, company: Partial<AtlasCompany> | null) {
  const { doc: pdf } = state;

  // Red brand bar
  fillRect(pdf, 0, 0, PAGE_W, 22, BRAND_RED);

  // "Z" logo mark
  fillRect(pdf, MARGIN, 3, 14, 14, [200, 30, 30]);
  setFont(pdf, 'bold', 14, WHITE);
  pdf.text('Z', MARGIN + 4.5, 13);

  // Title
  setFont(pdf, 'bold', 13, WHITE);
  pdf.text('Zafirix Pro', MARGIN + 18, 10);
  setFont(pdf, 'normal', 8, [255, 200, 200]);
  pdf.text('Documents IA — Export officiel', MARGIN + 18, 15);

  // Company name (top right)
  if (company?.raisonSociale) {
    setFont(pdf, 'bold', 9, WHITE);
    pdf.text(company.raisonSociale, PAGE_W - MARGIN, 10, { align: 'right' });
    if (company.ice) {
      setFont(pdf, 'normal', 7, [255, 200, 200]);
      pdf.text(`ICE: ${company.ice}`, PAGE_W - MARGIN, 15, { align: 'right' });
    }
  }

  state.y = 28;
}

function addMetaSection(state: PdfState, doc: AtlasDocument) {
  const { doc: pdf } = state;
  checkNewPage(state, 30);

  // Section box
  fillRect(pdf, MARGIN, state.y, CONTENT_W, 28, GRAY_100);
  drawLine(pdf, MARGIN, state.y, MARGIN, state.y + 28, BRAND_RED, 1.5);

  setFont(pdf, 'bold', 9, GRAY_700);
  pdf.text('Informations du document', MARGIN + 4, state.y + 6);

  const col1x = MARGIN + 4;
  const col2x = MARGIN + CONTENT_W / 2;
  const lineH = 5.5;
  let ly = state.y + 12;

  const meta = [
    ['ID Document', String(doc.id).slice(0, 8) + '…'],
    ['Fichier', (doc.filename ?? '').slice(0, 45)],
    ['Ajouté le', doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('fr-MA') : '—'],
  ];
  const meta2 = [
    ['Type détecté', documentTypeFromDocument(doc)?.replace(/_/g, ' ') ?? '—'],
    ['Statut', validationStatusFromDocument(doc) ?? 'pending_review'],
    ['Exporté le', new Date().toLocaleDateString('fr-MA')],
  ];

  for (let i = 0; i < meta.length; i++) {
    setFont(pdf, 'normal', 7.5, GRAY_400);
    pdf.text(meta[i][0], col1x, ly);
    setFont(pdf, 'bold', 7.5, GRAY_800);
    pdf.text(meta[i][1], col1x + 24, ly);

    setFont(pdf, 'normal', 7.5, GRAY_400);
    pdf.text(meta2[i][0], col2x, ly);
    setFont(pdf, 'bold', 7.5, GRAY_800);
    pdf.text(meta2[i][1], col2x + 24, ly);

    ly += lineH;
  }

  state.y += 33;
}

function addClassificationSection(state: PdfState, cls: AtlasDocumentClassification) {
  const { doc: pdf } = state;
  checkNewPage(state, 26);

  setFont(pdf, 'bold', 9.5, GRAY_800);
  pdf.text('Classification IA', MARGIN, state.y);
  drawLine(pdf, MARGIN, state.y + 2, MARGIN + CONTENT_W, state.y + 2, GRAY_200);
  state.y += 6;

  const conf = cls.type_confidence ?? 0;
  const confColor = conf >= 0.9 ? GREEN_600 : conf >= 0.7 ? AMBER_600 : RED_600;

  fillRect(pdf, MARGIN, state.y, CONTENT_W, 18, GRAY_100);

  // Confidence pill
  const pillW = 28;
  fillRect(pdf, PAGE_W - MARGIN - pillW - 2, state.y + 3, pillW, 10, confColor);
  setFont(pdf, 'bold', 9, WHITE);
  pdf.text(`${Math.round(conf * 100)}%`, PAGE_W - MARGIN - pillW / 2 - 2, state.y + 9.5, { align: 'center' });

  setFont(pdf, 'bold', 8.5, GRAY_800);
  pdf.text((cls.detected_type ?? '').replace(/_/g, ' '), MARGIN + 4, state.y + 7);

  setFont(pdf, 'normal', 7, GRAY_400);
  pdf.text(cls.classification_reason ?? '', MARGIN + 4, state.y + 13, { maxWidth: CONTENT_W - pillW - 12 });

  const tags: string[] = [];
  if (cls.detected_language) tags.push(`Langue: ${cls.detected_language}`);
  if (cls.detected_currency) tags.push(`Devise: ${cls.detected_currency}`);
  if (cls.detected_country) tags.push(`Pays: ${cls.detected_country}`);
  if (tags.length) {
    setFont(pdf, 'normal', 7, GRAY_400);
    pdf.text(tags.join('  ·  '), MARGIN + 4, state.y + 18.5);
    state.y += 22;
  } else {
    state.y += 20;
  }
}

function confidenceDot(pdf: jsPDF, x: number, y: number, confidence: number | null) {
  if (confidence == null) return;
  const color = confidence >= 0.9 ? GREEN_600 : confidence >= 0.7 ? AMBER_600 : RED_600;
  pdf.setFillColor(color[0], color[1], color[2]);
  pdf.circle(x, y, 1.2, 'F');
}

type FieldDef = { label: string; key: keyof AtlasStructuredExtraction };

function addFieldsTable(state: PdfState, ext: AtlasStructuredExtraction, fields: FieldDef[], sectionTitle: string) {
  const { doc: pdf } = state;
  checkNewPage(state, 14);

  setFont(pdf, 'bold', 9.5, GRAY_800);
  pdf.text(sectionTitle, MARGIN, state.y);
  drawLine(pdf, MARGIN, state.y + 2, MARGIN + CONTENT_W, state.y + 2, GRAY_200);
  state.y += 6;

  // Header row
  fillRect(pdf, MARGIN, state.y, CONTENT_W, 6, GRAY_200);
  setFont(pdf, 'bold', 7, GRAY_700);
  pdf.text('Champ', MARGIN + 2, state.y + 4.2);
  pdf.text('Valeur', MARGIN + 52, state.y + 4.2);
  pdf.text('Conf.', PAGE_W - MARGIN - 38, state.y + 4.2);
  pdf.text('Page', PAGE_W - MARGIN - 18, state.y + 4.2);
  pdf.text('Corrigé', PAGE_W - MARGIN - 4, state.y + 4.2, { align: 'right' });
  state.y += 6;

  let even = false;
  for (const { label, key } of fields) {
    const f = extractedField(ext, key);
    if (!f) continue;
    if (!f.displayValue) continue;

    checkNewPage(state, 7);

    if (even) fillRect(pdf, MARGIN, state.y, CONTENT_W, 6.5, [249, 250, 251]);
    even = !even;

    // Label
    setFont(pdf, 'normal', 7.5, GRAY_400);
    pdf.text(label, MARGIN + 2, state.y + 4.5);

    // Value
    setFont(pdf, f.corrected ? 'bold' : 'normal', 7.5, f.corrected ? AMBER_600 : GRAY_800);
    const valueText = f.displayValue.slice(0, 60);
    pdf.text(valueText, MARGIN + 52, state.y + 4.5);

    // Confidence dot + %
    if (f.confidence != null) {
      confidenceDot(pdf, PAGE_W - MARGIN - 34, state.y + 3.5, f.confidence);
      setFont(pdf, 'normal', 7, GRAY_400);
      pdf.text(`${Math.round(f.confidence * 100)}%`, PAGE_W - MARGIN - 31, state.y + 4.5);
    }

    // Source page
    if (f.sourcePage != null) {
      setFont(pdf, 'normal', 7, GRAY_400);
      pdf.text(`p.${f.sourcePage}`, PAGE_W - MARGIN - 18, state.y + 4.5);
    }

    // Corrected flag
    if (f.corrected) {
      setFont(pdf, 'bold', 7, AMBER_600);
      pdf.text('✓', PAGE_W - MARGIN - 2, state.y + 4.5, { align: 'right' });
    }

    state.y += 6.5;
  }

  state.y += 4;
}

function addLineItemsTable(state: PdfState, ext: AtlasStructuredExtraction) {
  if (!Array.isArray(ext.line_items) || ext.line_items.length === 0) return;

  const { doc: pdf } = state;
  checkNewPage(state, 20);

  setFont(pdf, 'bold', 9.5, GRAY_800);
  pdf.text('Lignes de facturation', MARGIN, state.y);
  drawLine(pdf, MARGIN, state.y + 2, MARGIN + CONTENT_W, state.y + 2, GRAY_200);
  state.y += 6;

  // Header
  fillRect(pdf, MARGIN, state.y, CONTENT_W, 6, GRAY_200);
  setFont(pdf, 'bold', 7, GRAY_700);
  const cols = [
    { label: 'Description', x: MARGIN + 2, w: 80 },
    { label: 'Qté', x: MARGIN + 84, w: 18 },
    { label: 'P.U.', x: MARGIN + 104, w: 28 },
    { label: 'TVA', x: MARGIN + 134, w: 20 },
    { label: 'Total', x: MARGIN + 156, w: 26 },
  ];
  for (const col of cols) pdf.text(col.label, col.x, state.y + 4.2);
  state.y += 6;

  let even = false;
  for (const item of ext.line_items as Record<string, unknown>[]) {
    checkNewPage(state, 7);
    if (even) fillRect(pdf, MARGIN, state.y, CONTENT_W, 6.5, [249, 250, 251]);
    even = !even;

    setFont(pdf, 'normal', 7.5, GRAY_800);
    const desc = String(item.description ?? '').slice(0, 48);
    pdf.text(desc, MARGIN + 2, state.y + 4.5);
    pdf.text(String(item.quantity ?? ''), MARGIN + 84, state.y + 4.5);
    pdf.text(String(item.unit_price ?? ''), MARGIN + 104, state.y + 4.5);
    pdf.text(String(item.tax ?? ''), MARGIN + 134, state.y + 4.5);
    setFont(pdf, 'bold', 7.5, GRAY_800);
    pdf.text(String(item.total ?? ''), MARGIN + 156, state.y + 4.5);
    state.y += 6.5;
  }

  state.y += 4;
}

function addCorrectionsLog(state: PdfState, doc: AtlasDocument) {
  const meta = doc.metadata as Record<string, unknown> | null;
  const corrections = Array.isArray(meta?.corrections) ? meta.corrections as Record<string, unknown>[] : [];
  if (corrections.length === 0) return;

  const { doc: pdf } = state;
  checkNewPage(state, 20);

  setFont(pdf, 'bold', 9.5, GRAY_800);
  pdf.text('Journal des corrections', MARGIN, state.y);
  drawLine(pdf, MARGIN, state.y + 2, MARGIN + CONTENT_W, state.y + 2, GRAY_200);
  state.y += 6;

  for (const c of corrections) {
    checkNewPage(state, 10);

    fillRect(pdf, MARGIN, state.y, CONTENT_W, 9, [255, 251, 235]);
    drawLine(pdf, MARGIN, state.y, MARGIN, state.y + 9, AMBER_600, 1.2);

    setFont(pdf, 'bold', 7.5, GRAY_800);
    pdf.text(String(c.field ?? ''), MARGIN + 3, state.y + 4);
    setFont(pdf, 'normal', 7, GRAY_400);
    pdf.text(`${String(c.original_value ?? '—')} → ${String(c.corrected_value ?? '')}`, MARGIN + 3, state.y + 7.5);
    if (c.corrected_at) {
      setFont(pdf, 'normal', 6.5, GRAY_400);
      pdf.text(new Date(String(c.corrected_at)).toLocaleString('fr-MA'), PAGE_W - MARGIN - 2, state.y + 4, { align: 'right' });
    }
    state.y += 10;
  }

  state.y += 3;
}

function addValidationStatus(state: PdfState, doc: AtlasDocument) {
  const { doc: pdf } = state;
  checkNewPage(state, 18);

  const status = validationStatusFromDocument(doc) ?? 'pending_review';
  const isValidated = status === 'validated';

  const boxColor = isValidated ? [240, 253, 244] as const : [255, 251, 235] as const;
  const accentColor = isValidated ? GREEN_600 : AMBER_600;
  const label = isValidated ? 'Document validé' : `Statut: ${status.replace(/_/g, ' ')}`;

  fillRect(pdf, MARGIN, state.y, CONTENT_W, 12, boxColor);
  drawLine(pdf, MARGIN, state.y, MARGIN, state.y + 12, accentColor, 1.5);

  setFont(pdf, 'bold', 8.5, accentColor);
  pdf.text(label, MARGIN + 5, state.y + 8);

  const meta = doc.metadata as Record<string, unknown> | null;
  if (meta?.validated_at) {
    setFont(pdf, 'normal', 7, GRAY_400);
    pdf.text(`Validé le ${new Date(String(meta.validated_at)).toLocaleDateString('fr-MA')}`, PAGE_W - MARGIN - 2, state.y + 8, { align: 'right' });
  }

  state.y += 15;
}

function addCompanyFooterBlock(state: PdfState, company: Partial<AtlasCompany> | null) {
  if (!company) return;
  const { doc: pdf } = state;
  checkNewPage(state, 20);

  drawLine(pdf, MARGIN, state.y, MARGIN + CONTENT_W, state.y, GRAY_200);
  state.y += 4;

  setFont(pdf, 'bold', 8, GRAY_700);
  pdf.text(company.raisonSociale ?? '', MARGIN, state.y + 4);
  setFont(pdf, 'normal', 7, GRAY_400);

  const details: string[] = [];
  if (company.adresse) details.push(company.adresse);
  if (company.ville) details.push(company.ville);
  if (company.telephone) details.push(`Tél: ${company.telephone}`);
  if (company.email) details.push(company.email);

  const idents: string[] = [];
  if (company.ice) idents.push(`ICE: ${company.ice}`);
  if (company.if_fiscal) idents.push(`IF: ${company.if_fiscal}`);
  if (company.rc) idents.push(`RC: ${company.rc}`);

  if (details.length) pdf.text(details.join('  ·  '), MARGIN, state.y + 9, { maxWidth: CONTENT_W * 0.65 });
  if (idents.length) pdf.text(idents.join('  ·  '), PAGE_W - MARGIN, state.y + 4, { align: 'right' });

  state.y += 14;
}

// ── Main export function ──────────────────────────────────────────────────────

export function generateDocumentPdf(
  doc: AtlasDocument,
  company: Partial<AtlasCompany> | null = null,
): ArrayBuffer {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const state: PdfState = { doc: pdf, y: 0, page: 1 };

  const cls = classificationFromDocument(doc);
  const ext = structuredExtractionFromDocument(doc);

  // ── Page 1 ─────────────────────────────────────────────────────────────────

  addHeader(state, doc, company);
  addMetaSection(state, doc);

  if (cls) {
    state.y += 4;
    addClassificationSection(state, cls);
  }

  // ── Extracted fields ───────────────────────────────────────────────────────

  if (ext) {
    state.y += 4;

    addFieldsTable(state, ext, [
      { label: 'Fournisseur', key: 'supplier_name' },
      { label: 'ICE', key: 'supplier_ice' },
      { label: 'IF', key: 'supplier_if' },
      { label: 'RC', key: 'supplier_rc' },
      { label: 'Adresse', key: 'supplier_address' },
    ], 'Informations fournisseur');

    state.y += 2;

    addFieldsTable(state, ext, [
      { label: 'N° Facture', key: 'invoice_number' },
      { label: 'Date facture', key: 'invoice_date' },
      { label: 'Date échéance', key: 'due_date' },
      { label: 'Montant HT', key: 'subtotal_ht' },
      { label: 'TVA', key: 'tva_amount' },
      { label: 'Taux TVA', key: 'tva_rate' },
      { label: 'Total TTC', key: 'total_ttc' },
      { label: 'Devise', key: 'currency' },
      { label: 'Mode de paiement', key: 'payment_method' },
    ], 'Données financières');

    state.y += 2;
    addLineItemsTable(state, ext);
  }

  // ── Corrections + validation ───────────────────────────────────────────────

  addCorrectionsLog(state, doc);
  state.y += 2;
  addValidationStatus(state, doc);

  // ── Company block ──────────────────────────────────────────────────────────

  if (company) {
    state.y += 4;
    addCompanyFooterBlock(state, company);
  }

  // Final footer on last page
  addFooter(state);

  return pdf.output('arraybuffer') as ArrayBuffer;
}

export function documentPdfFilename(doc: AtlasDocument): string {
  const base = (doc.filename ?? 'document').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `zafirix_${base}_${date}.pdf`;
}
