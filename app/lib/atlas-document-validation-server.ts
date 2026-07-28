/**
 * Server-side document validation — registers supplier invoices, journal lines, and TVA
 * for single-invoice and multi-page / multi-invoice PDFs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasDocument,
  AtlasDocumentType,
  AtlasOcrDetectedInvoice,
  AtlasStructuredExtraction,
} from '@/app/types/atlas-document';
import { asRecord } from '@/app/lib/atlas-json';
import { logDocumentEvent } from '@/app/lib/atlas-document-events';
import {
  buildJournalLines,
  buildTvaSuggestion,
  persistJournalLines,
  persistTvaSuggestion,
} from '@/app/lib/atlas-documents-accounting-engine';
import { ocrInvoicesFromDocument } from '@/app/lib/atlas-documents-repository';
import {
  creatableOcrInvoices,
  detectedInvoiceToStructuredExtraction,
  sourcePageForDetectedInvoice,
  validateDetectedInvoiceFields,
} from '@/app/lib/atlas-ocr-invoices-detect';

export type DocumentValidationDetail = {
  page: number;
  invoice_number?: string;
  missing?: string[];
  error?: string;
};

export type DocumentValidationResult =
  | {
      ok: true;
      invoicesCreated: number;
      invoicesSkipped: number;
      invoiceIds: string[];
      journalLineCount: number;
      tvaAmount: number;
    }
  | {
      ok: false;
      error: string;
      message: string;
      details?: DocumentValidationDetail[];
    };

type DocumentRow = {
  id: string;
  company_id: string | null;
  processing_status: string | null;
  validation_status: string | null;
  document_type: string | null;
  metadata: unknown;
  content: unknown;
};

function rowToAtlasDocument(row: DocumentRow): AtlasDocument {
  const metadata = asRecord(row.metadata) ?? undefined;
  return {
    id: String(row.id),
    companyId: row.company_id ? String(row.company_id) : null,
    type: 'ocr',
    title: '',
    kind: 'ocr',
    source: 'upload',
    status: 'active',
    processingStatus: (row.processing_status as AtlasDocument['processingStatus']) ?? 'processed',
    documentType: (row.document_type as AtlasDocumentType) ?? undefined,
    validationStatus: (row.validation_status as AtlasDocument['validationStatus']) ?? 'pending_review',
    metadata,
    content: row.content ?? undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function structuredExtractionFromMetadata(metadata: Record<string, unknown>): AtlasStructuredExtraction {
  const raw = metadata.extraction;
  if (!raw || typeof raw !== 'object') return {};
  return raw as AtlasStructuredExtraction;
}

function extractNum(field?: { value?: string | number | null; user_corrected_value?: string } | null): number {
  if (!field) return 0;
  const raw = field.user_corrected_value != null ? field.user_corrected_value : field.value;
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function extractStr(field?: { value?: string | number | null; user_corrected_value?: string } | null): string {
  if (!field) return '';
  const raw = field.user_corrected_value != null ? field.user_corrected_value : field.value;
  return raw != null ? String(raw).trim() : '';
}

function structuredExtractionHasInvoiceData(extraction: AtlasStructuredExtraction): boolean {
  const ht = extractNum(extraction.subtotal_ht);
  const ttc = extractNum(extraction.total_ttc);
  const num = extractStr(extraction.invoice_number);
  return ht > 0 || ttc > 0 || Boolean(num);
}

function validateStructuredExtraction(
  extraction: AtlasStructuredExtraction,
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const ht = extractNum(extraction.subtotal_ht);
  const ttc = extractNum(extraction.total_ttc);
  if (ht <= 0 && ttc <= 0) missing.push('montant_ht_or_ttc');
  return missing.length ? { ok: false, missing } : { ok: true };
}

function parseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const parts = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!parts) return null;
  const [, d, m, y] = parts;
  return `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function findExistingSupplierInvoice(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
  sourcePage: number,
  invoiceNumber?: string | null,
): Promise<string | null> {
  let query = admin
    .from('atlas_supplier_invoices')
    .select('id')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .eq('source_page', sourcePage);

  const trimmed = invoiceNumber?.trim();
  query = trimmed ? query.eq('invoice_number', trimmed) : query.is('invoice_number', null);

  const { data } = await query.maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function registerSinglePurchaseInvoice(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  documentId: string,
  documentType: AtlasDocumentType | null,
  extraction: AtlasStructuredExtraction,
  regime: string,
  sourcePage?: number,
): Promise<{ invoiceId: string; journalLineCount: number; tvaAmount: number }> {
  const parsedDate = parseDate(extractStr(extraction.invoice_date));
  const amountHt = extractNum(extraction.subtotal_ht);
  const vatAmount = extractNum(extraction.tva_amount);
  const amountTtc = extractNum(extraction.total_ttc) || amountHt + vatAmount;

  const { data: inv, error: invErr } = await admin
    .from('atlas_supplier_invoices')
    .insert({
      user_id: userId,
      company_id: companyId,
      document_id: documentId,
      source_document_id: documentId,
      source_page: sourcePage ?? null,
      supplier_name: extractStr(extraction.supplier_name) || extractStr(extraction.customer_name) || 'Fournisseur inconnu',
      supplier_ice: extractStr(extraction.supplier_ice) || null,
      supplier_if: extractStr(extraction.supplier_if) || null,
      supplier_rc: extractStr(extraction.supplier_rc) || null,
      supplier_address: extractStr(extraction.supplier_address) || null,
      customer_name: extractStr(extraction.customer_name) || null,
      invoice_number: extractStr(extraction.invoice_number) || null,
      invoice_date: parsedDate,
      amount_ht: amountHt || null,
      vat_amount: vatAmount || null,
      amount_ttc: amountTtc || null,
      vat_rate: extractNum(extraction.tva_rate) || null,
      payment_method: extractStr(extraction.payment_method) || null,
      currency: extractStr(extraction.currency) || 'MAD',
      category: extractStr(extraction.category_suggestion) || null,
      accounting_account: extractStr(extraction.accounting_account) || null,
      line_items: Array.isArray(extraction.line_items) ? extraction.line_items : [],
      status: 'unpaid',
      validation_status: 'draft',
      generated_by: 'documents_ia',
      user_verified: true,
      metadata: {
        source_document_id: documentId,
        generated_by: 'documents_ia',
        generated_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
        ...(sourcePage != null ? { source_page: sourcePage } : {}),
      },
    })
    .select('id')
    .single();

  if (invErr) throw new Error(`Supplier invoice creation failed: ${invErr.message}`);
  const invoiceId = String(inv?.id);

  const isPurchase = documentType !== 'sales_invoice';
  const journalLines = buildJournalLines(documentId, extraction, isPurchase, invoiceId);
  let journalLineCount = 0;
  if (journalLines.length > 0) {
    const jr = await persistJournalLines(admin, userId, companyId, journalLines);
    if (jr.ok) journalLineCount = jr.ids.length;
  }

  const tvaSuggestion = buildTvaSuggestion(documentId, extraction, isPurchase, invoiceId, regime);
  let tvaAmount = 0;
  if (tvaSuggestion) {
    const tr = await persistTvaSuggestion(admin, userId, companyId, tvaSuggestion);
    if (tr.ok) tvaAmount = tvaSuggestion.amount;
  }

  return { invoiceId, journalLineCount, tvaAmount };
}

function resolveInvoicesToRegister(
  doc: AtlasDocument,
  structured: AtlasStructuredExtraction,
): AtlasOcrDetectedInvoice[] | 'single_structured' {
  const detected = creatableOcrInvoices(ocrInvoicesFromDocument(doc));
  if (detected.length > 1) return detected;
  if (detected.length === 1 && !structuredExtractionHasInvoiceData(structured)) return detected;
  return 'single_structured';
}

export async function registerValidatedDocumentRecords(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<DocumentValidationResult> {
  const { data: row, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('id, company_id, processing_status, validation_status, document_type, metadata, content')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: 'document_not_found', message: 'Document introuvable.' };
  }

  const docRow = row as DocumentRow;
  if (docRow.processing_status !== 'processed') {
    return {
      ok: false,
      error: 'document_not_processed',
      message: 'Le document doit être analysé avant validation.',
    };
  }

  const companyId = docRow.company_id ? String(docRow.company_id) : '';
  if (!companyId) {
    return { ok: false, error: 'company_required', message: 'Société active requise pour enregistrer les factures.' };
  }

  const { data: companyRow } = await admin
    .from('atlas_companies')
    .select('company_json')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  const companyJson = companyRow?.company_json;
  const regime =
    companyJson && typeof companyJson === 'object'
      ? String((companyJson as Record<string, unknown>).regimeTVA ?? 'mensuel')
      : 'mensuel';

  const atlasDoc = rowToAtlasDocument(docRow);
  const metadata = asRecord(docRow.metadata) ?? {};
  const structured = structuredExtractionFromMetadata(metadata);
  const docType = (docRow.document_type as AtlasDocumentType | null) ?? 'purchase_invoice';
  const invoicesPlan = resolveInvoicesToRegister(atlasDoc, structured);

  const invoiceIds: string[] = [];
  let journalLineCount = 0;
  let tvaAmount = 0;
  let invoicesCreated = 0;
  let invoicesSkipped = 0;
  const details: DocumentValidationDetail[] = [];

  if (invoicesPlan === 'single_structured') {
    const extraction =
      structuredExtractionHasInvoiceData(structured)
        ? structured
        : detectedInvoiceToStructuredExtraction(
            creatableOcrInvoices(ocrInvoicesFromDocument(atlasDoc))[0] ?? {
              page_number: 1,
              status: 'needs_review',
            },
          );

    const valid = validateStructuredExtraction(extraction);
    if (!valid.ok) {
      return {
        ok: false,
        error: 'validation_failed',
        message: `Champs requis manquants: ${valid.missing.join(', ')}`,
        details: [{ page: 1, missing: valid.missing }],
      };
    }

    try {
      const existing = await findExistingSupplierInvoice(admin, userId, documentId, 0, extractStr(extraction.invoice_number));
      if (existing) {
        invoiceIds.push(existing);
        invoicesSkipped += 1;
      } else {
        const r = await registerSinglePurchaseInvoice(
          admin,
          userId,
          companyId,
          documentId,
          docType,
          extraction,
          regime,
        );
        invoiceIds.push(r.invoiceId);
        journalLineCount += r.journalLineCount;
        tvaAmount += r.tvaAmount;
        invoicesCreated += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: 'registration_failed',
        message,
        details: [{ page: 1, error: message }],
      };
    }
  } else {
    for (const detected of invoicesPlan) {
      const sourcePage = sourcePageForDetectedInvoice(detected);
      const valid = validateDetectedInvoiceFields(detected);
      if (!valid.ok) {
        details.push({
          page: sourcePage,
          invoice_number: detected.invoice_number,
          missing: valid.missing,
        });
        invoicesSkipped += 1;
        continue;
      }

      const extraction = detectedInvoiceToStructuredExtraction(detected);
      try {
        const existing = await findExistingSupplierInvoice(
          admin,
          userId,
          documentId,
          sourcePage,
          detected.invoice_number,
        );
        if (existing) {
          invoiceIds.push(existing);
          invoicesSkipped += 1;
          continue;
        }

        const r = await registerSinglePurchaseInvoice(
          admin,
          userId,
          companyId,
          documentId,
          docType,
          extraction,
          regime,
          sourcePage,
        );
        invoiceIds.push(r.invoiceId);
        journalLineCount += r.journalLineCount;
        tvaAmount += r.tvaAmount;
        invoicesCreated += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        details.push({
          page: sourcePage,
          invoice_number: detected.invoice_number,
          error: message,
        });
        invoicesSkipped += 1;
      }
    }

    if (invoicesCreated === 0 && invoiceIds.length === 0) {
      return {
        ok: false,
        error: 'validation_failed',
        message: 'Aucune facture enregistrée. Vérifiez les montants et le fournisseur sur chaque page.',
        details,
      };
    }
  }

  return {
    ok: true,
    invoicesCreated,
    invoicesSkipped,
    invoiceIds,
    journalLineCount,
    tvaAmount,
  };
}

export async function markDocumentValidated(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
  companyId: string | null,
  previousStatus: string | null,
  registration: DocumentValidationResult & { ok: true },
): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await admin
    .from('atlas_documents')
    .select('metadata')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  const meta = asRecord(row?.metadata);
  await admin
    .from('atlas_documents')
    .update({
      validation_status: 'validated',
      validated_at: now,
      validated_by: userId,
      metadata: {
        ...meta,
        validation_summary: {
          invoices_created: registration.invoicesCreated,
          invoices_skipped: registration.invoicesSkipped,
          invoice_ids: registration.invoiceIds,
          journal_line_count: registration.journalLineCount,
          tva_amount: registration.tvaAmount,
          validated_at: now,
        },
      },
      updated_at: now,
    })
    .eq('id', documentId)
    .eq('user_id', userId);

  if (companyId) {
    void logDocumentEvent({
      companyId,
      documentId,
      userId,
      eventType: 'user_validated',
      payload: {
        action: 'validated',
        previous_status: previousStatus,
        ...registration,
      },
    });
  }
}
