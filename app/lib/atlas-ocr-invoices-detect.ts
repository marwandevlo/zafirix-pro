/**
 * Per-invoice detection from OCR page results (Documents IA).
 */

import type { AtlasOcrDetectedInvoice, AtlasOcrExtraction, AtlasOcrPageMeta } from '@/app/types/atlas-document';

export function pageLooksLikeInvoice(extraction: AtlasOcrExtraction): boolean {
  const hasSupplier = Boolean(extraction.fournisseur?.trim());
  const hasNumber = Boolean(extraction.numero_facture?.trim());
  const hasAmount = extraction.montant_ttc != null && Number(extraction.montant_ttc) > 0;
  return hasNumber || (hasSupplier && hasAmount) || hasAmount;
}

function deriveInvoiceStatus(
  supplierName?: string,
  amountTtc?: number,
): AtlasOcrDetectedInvoice['status'] {
  const hasSupplier = Boolean(supplierName?.trim());
  const hasAmount = amountTtc != null && Number(amountTtc) > 0;
  if (!hasSupplier || !hasAmount) return 'needs_review';
  return 'detected';
}

function extractionToDetectedInvoice(pageNum: number, extraction: AtlasOcrExtraction): AtlasOcrDetectedInvoice {
  const supplierName = extraction.fournisseur?.trim();
  const amountTtc = extraction.montant_ttc;
  return {
    page_number: pageNum,
    source_pages: [pageNum],
    invoice_number: extraction.numero_facture?.trim() || undefined,
    supplier_name: supplierName || undefined,
    supplier_ice: extraction.supplier_ice?.replace(/\D/g, '') || undefined,
    supplier_if: extraction.supplier_if?.replace(/\D/g, '') || undefined,
    invoice_date: extraction.date?.trim() || undefined,
    amount_ht: extraction.montant_ht,
    vat_amount: extraction.montant_tva,
    amount_ttc: amountTtc,
    vat_rate: extraction.taux_tva,
    status: deriveInvoiceStatus(supplierName, amountTtc),
  };
}

function mergeInvoiceGroup(pages: AtlasOcrDetectedInvoice[]): AtlasOcrDetectedInvoice {
  const sourcePages = pages.map((p) => p.page_number).sort((a, b) => a - b);
  const firstPage = sourcePages[0];
  let best = pages[0];
  for (const page of pages) {
    if ((page.amount_ttc ?? 0) > (best.amount_ttc ?? 0)) best = page;
  }
  const supplierName = pages.find((p) => p.supplier_name)?.supplier_name;
  const invoiceDate = pages.find((p) => p.invoice_date)?.invoice_date;
  const invoiceNumber = pages.find((p) => p.invoice_number)?.invoice_number;
  const supplierIce = pages.find((p) => p.supplier_ice)?.supplier_ice;
  const supplierIf = pages.find((p) => p.supplier_if)?.supplier_if;
  return {
    page_number: firstPage,
    source_pages: sourcePages,
    invoice_number: invoiceNumber,
    supplier_name: supplierName,
    supplier_ice: supplierIce,
    supplier_if: supplierIf,
    invoice_date: invoiceDate,
    amount_ht: best.amount_ht,
    vat_amount: best.vat_amount,
    amount_ttc: best.amount_ttc,
    vat_rate: best.vat_rate,
    status: deriveInvoiceStatus(supplierName, best.amount_ttc),
  };
}

/** Build structured invoices[] from per-page OCR (group by invoice_number when set). */
export function buildDetectedInvoicesFromPageResults(pageResults: AtlasOcrPageMeta[]): AtlasOcrDetectedInvoice[] {
  const pageEntries: AtlasOcrDetectedInvoice[] = [];

  for (const page of pageResults) {
    if (!page.success || !page.extraction) continue;

    if (!pageLooksLikeInvoice(page.extraction)) {
      pageEntries.push({
        page_number: page.page_number,
        source_pages: [page.page_number],
        status: 'no_invoice_detected',
      });
      continue;
    }

    pageEntries.push(extractionToDetectedInvoice(page.page_number, page.extraction));
  }

  const noInvoice = pageEntries.filter((e) => e.status === 'no_invoice_detected');
  const candidates = pageEntries.filter((e) => e.status !== 'no_invoice_detected');

  const groups = new Map<string, AtlasOcrDetectedInvoice[]>();
  for (const entry of candidates) {
    const key = entry.invoice_number?.trim().toLowerCase() || `__page_${entry.page_number}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const merged: AtlasOcrDetectedInvoice[] = [...noInvoice];
  for (const group of groups.values()) {
    merged.push(group.length === 1 ? group[0] : mergeInvoiceGroup(group));
  }

  return merged.sort((a, b) => a.page_number - b.page_number);
}

/** Single image OCR → one invoice entry (or no_invoice_detected). */
export function buildDetectedInvoicesFromExtraction(
  extraction: AtlasOcrExtraction | null,
  pageNumber = 1,
): AtlasOcrDetectedInvoice[] {
  if (!extraction) return [];
  if (!pageLooksLikeInvoice(extraction)) {
    return [{ page_number: pageNumber, source_pages: [pageNumber], status: 'no_invoice_detected' }];
  }
  return [extractionToDetectedInvoice(pageNumber, extraction)];
}

/** Top-level summary fields: first creatable invoice (backward compatible). */
export function summaryExtractionFromInvoices(invoices: AtlasOcrDetectedInvoice[]): AtlasOcrExtraction {
  const detected = invoices.filter((i) => i.status !== 'no_invoice_detected');
  if (!detected.length) return {};
  const first = detected[0];
  return {
    numero_facture: first.invoice_number,
    fournisseur: first.supplier_name,
    supplier_ice: first.supplier_ice,
    supplier_if: first.supplier_if,
    date: first.invoice_date,
    montant_ht: first.amount_ht,
    montant_tva: first.vat_amount,
    montant_ttc: first.amount_ttc,
    taux_tva: first.vat_rate,
  };
}

export function creatableOcrInvoices(invoices: AtlasOcrDetectedInvoice[]): AtlasOcrDetectedInvoice[] {
  return invoices.filter((i) => i.status !== 'no_invoice_detected');
}

export function supplierInvoiceDedupeKey(
  documentId: string,
  sourcePage: number,
  invoiceNumber?: string | null,
): string {
  return `${documentId}:${sourcePage}:${(invoiceNumber ?? '').trim().toLowerCase()}`;
}

export function sourcePageForDetectedInvoice(invoice: AtlasOcrDetectedInvoice): number {
  return invoice.page_number;
}

/** Build structured extraction fields from a per-page detected invoice (multi-PDF path). */
export function detectedInvoiceToStructuredExtraction(
  detected: AtlasOcrDetectedInvoice,
): import('@/app/types/atlas-document').AtlasStructuredExtraction {
  const page = detected.page_number;
  const confidence = detected.confidence ?? 0.85;
  const field = (value: string | number | null | undefined) =>
    value != null && value !== ''
      ? { value, confidence, source_page: page }
      : undefined;

  return {
    supplier_name: field(detected.supplier_name),
    supplier_ice: field(detected.supplier_ice),
    supplier_if: field(detected.supplier_if),
    invoice_number: field(detected.invoice_number),
    invoice_date: field(detected.invoice_date),
    subtotal_ht: field(detected.amount_ht),
    tva_amount: field(detected.vat_amount),
    total_ttc: field(detected.amount_ttc),
    tva_rate: field(detected.vat_rate),
  };
}

function structuredFieldDigits(
  field?: { value?: string | number | null; normalized_value?: string; user_corrected_value?: string } | null,
): string {
  if (!field) return '';
  const raw = field.user_corrected_value ?? field.normalized_value ?? field.value;
  return raw != null ? String(raw).replace(/\D/g, '') : '';
}

/** Copy document-level ICE/IF onto a detected invoice when the per-invoice row omitted them. */
export function enrichDetectedInvoiceFromStructured(
  detected: AtlasOcrDetectedInvoice,
  structured?: import('@/app/types/atlas-document').AtlasStructuredExtraction | null,
): AtlasOcrDetectedInvoice {
  if (!structured) return detected;
  const ice =
    detected.supplier_ice ||
    structuredFieldDigits(structured.supplier_ice) ||
    structured.morocco_supplier_ids?.ice ||
    '';
  const ifFiscal =
    detected.supplier_if ||
    structuredFieldDigits(structured.supplier_if) ||
    structured.morocco_supplier_ids?.if ||
    '';
  if (!ice && !ifFiscal) return detected;
  return {
    ...detected,
    supplier_ice: ice || detected.supplier_ice,
    supplier_if: ifFiscal || detected.supplier_if,
  };
}

export function validateDetectedInvoiceFields(
  detected: AtlasOcrDetectedInvoice,
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const hasAmount =
    (detected.amount_ttc != null && detected.amount_ttc > 0) ||
    (detected.amount_ht != null && detected.amount_ht > 0);
  if (!hasAmount) missing.push('montant_ht_or_ttc');
  return missing.length ? { ok: false, missing } : { ok: true };
}
