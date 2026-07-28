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
import { createBankStatementFromDocument } from '@/app/lib/atlas-bank-server';
import { parseNestedClassification } from '@/app/lib/atlas-ai-json-parse';
import { isBankStatementType } from '@/app/lib/atlas-document-type-utils';

export type DocumentValidationDetail = {
  page: number;
  invoice_number?: string;
  missing?: string[];
  error?: string;
};

export type DocumentValidationResult =
  | {
      ok: true;
      documentKind: 'invoice' | 'bank_statement';
      invoicesCreated: number;
      invoicesSkipped: number;
      invoiceIds: string[];
      journalLineCount: number;
      tvaAmount: number;
      statementId?: string;
      transactionCount?: number;
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
  created_at?: string | null;
};

function uploadDateFromDocument(row: DocumentRow): string | null {
  if (!row.created_at) return null;
  const ymd = String(row.created_at).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

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

function classificationFromMetadata(metadata: Record<string, unknown>) {
  const parsed = parseNestedClassification(metadata.classification);
  if (!parsed?.detected_type) return null;
  return { detected_type: parsed.detected_type as AtlasDocumentType };
}

function validateBankStatementExtraction(
  _extraction: AtlasStructuredExtraction,
  _metadata: Record<string, unknown>,
): { ok: true } | { ok: false; missing: string[] } {
  // Classification confirmed as bank_statement — invoice fields (HT, TVA, N° facture) are not required.
  return { ok: true };
}

async function findExistingBankStatement(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('zafirix_bank_statements')
    .select('id')
    .eq('user_id', userId)
    .eq('source_document_id', documentId)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function registerBankStatementFromDocument(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  documentId: string,
  extraction: AtlasStructuredExtraction,
  metadata: Record<string, unknown>,
): Promise<{ statementId: string; transactionCount: number }> {
  const existing = await findExistingBankStatement(admin, userId, documentId);
  if (existing) {
    const { data: stmt } = await admin
      .from('zafirix_bank_statements')
      .select('transaction_count')
      .eq('id', existing)
      .maybeSingle();
    return {
      statementId: existing,
      transactionCount: typeof stmt?.transaction_count === 'number' ? stmt.transaction_count : 0,
    };
  }

  const result = await createBankStatementFromDocument(admin, {
    userId,
    companyId,
    documentId,
    extraction,
    metadata,
  });
  return { statementId: result.statementId, transactionCount: result.transactionCount };
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
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!parts) return null;
  const [, d, m, y] = parts;
  return `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function resolvePersistedInvoiceDate(
  extraction: AtlasStructuredExtraction,
  uploadDateYmd: string | null,
): string | null {
  return parseDate(extractStr(extraction.invoice_date)) ?? uploadDateYmd;
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

async function findExistingClientInvoice(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
  invoiceNumber?: string | null,
): Promise<string | null> {
  let query = admin
    .from('atlas_invoices')
    .select('id')
    .eq('user_id', userId)
    .eq('source_document_id', documentId);

  const trimmed = invoiceNumber?.trim();
  query = trimmed ? query.eq('number', trimmed) : query.is('number', null);

  const { data } = await query.maybeSingle();
  return data?.id ? String(data.id) : null;
}

function isPurchaseDocument(
  docType: AtlasDocumentType | null,
  extraction: AtlasStructuredExtraction,
): boolean {
  if (docType === 'sales_invoice') return false;
  if (docType === 'purchase_invoice' || docType === 'receipt') return true;
  const raw = extraction.is_purchase?.value;
  if (raw != null) {
    const normalized = String(raw).trim().toLowerCase();
    if (normalized === 'false' || normalized === '0') return false;
    if (normalized === 'true' || normalized === '1') return true;
  }
  return true;
}

async function registerSinglePurchaseInvoice(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  documentId: string,
  documentType: AtlasDocumentType | null,
  extraction: AtlasStructuredExtraction,
  regime: string,
  uploadDateYmd: string | null,
  sourcePage?: number,
): Promise<{ invoiceId: string; journalLineCount: number; tvaAmount: number }> {
  const parsedDate = resolvePersistedInvoiceDate(extraction, uploadDateYmd);
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
  const journalLines = buildJournalLines(documentId, extraction, isPurchase, invoiceId, uploadDateYmd);
  let journalLineCount = 0;
  if (journalLines.length > 0) {
    const jr = await persistJournalLines(admin, userId, companyId, journalLines);
    if (jr.ok) journalLineCount = jr.ids.length;
  }

  const tvaSuggestion = buildTvaSuggestion(
    documentId,
    extraction,
    isPurchase,
    invoiceId,
    regime,
    uploadDateYmd,
  );
  let tvaAmount = 0;
  if (tvaSuggestion) {
    const tr = await persistTvaSuggestion(admin, userId, companyId, tvaSuggestion);
    if (tr.ok) tvaAmount = tvaSuggestion.amount;
  }

  return { invoiceId, journalLineCount, tvaAmount };
}

async function registerSingleSalesInvoice(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  documentId: string,
  extraction: AtlasStructuredExtraction,
  regime: string,
  uploadDateYmd: string | null,
): Promise<{ invoiceId: string; journalLineCount: number; tvaAmount: number }> {
  const parsedDate = resolvePersistedInvoiceDate(extraction, uploadDateYmd);
  if (!parsedDate) {
    throw new Error('Sales invoice requires OCR invoice_date or document upload date');
  }
  const dueDate = parseDate(extractStr(extraction.due_date)) ?? parsedDate;
  const amountHt = extractNum(extraction.subtotal_ht);
  const vatRate = extractNum(extraction.tva_rate) || 20;
  const vatAmount = extractNum(extraction.tva_amount) || Math.round(amountHt * (vatRate / 100) * 100) / 100;
  const amountTtc = extractNum(extraction.total_ttc) || amountHt + vatAmount;
  const clientName =
    extractStr(extraction.customer_name) || extractStr(extraction.supplier_name) || 'Client';
  const invoiceNumber = extractStr(extraction.invoice_number) || `AI-${documentId.slice(0, 8)}`;

  const { data: inv, error } = await admin
    .from('atlas_invoices')
    .insert({
      user_id: userId,
      company_id: companyId,
      number: invoiceNumber,
      client_name: clientName,
      issue_date: parsedDate,
      due_date: dueDate,
      payment_terms_days: 30,
      status: 'draft',
      amount_ht: amountHt,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total_ttc: amountTtc,
      source_document_id: documentId,
      source_document_type: 'sales_invoice',
      generated_by: 'documents_ia',
      validation_status: 'validated',
      metadata: {
        source_document_id: documentId,
        generated_by: 'documents_ia',
        generated_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
        auto_pipeline: true,
      },
    })
    .select('id')
    .single();

  if (error) throw new Error(`Sales invoice creation failed: ${error.message}`);
  const invoiceId = String(inv?.id);

  const journalLines = buildJournalLines(documentId, extraction, false, invoiceId, uploadDateYmd);
  let journalLineCount = 0;
  if (journalLines.length > 0) {
    const jr = await persistJournalLines(admin, userId, companyId, journalLines);
    if (jr.ok) journalLineCount = jr.ids.length;
  }

  const tvaSuggestion = buildTvaSuggestion(
    documentId,
    extraction,
    false,
    invoiceId,
    regime,
    uploadDateYmd,
  );
  let tvaAmount = 0;
  if (tvaSuggestion) {
    const tr = await persistTvaSuggestion(admin, userId, companyId, tvaSuggestion);
    if (tr.ok) tvaAmount = tvaSuggestion.amount;
  }

  return { invoiceId, journalLineCount, tvaAmount };
}

async function registerInvoiceFromExtraction(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  documentId: string,
  docType: AtlasDocumentType | null,
  extraction: AtlasStructuredExtraction,
  regime: string,
  uploadDateYmd: string | null,
  sourcePage?: number,
): Promise<{ invoiceId: string; journalLineCount: number; tvaAmount: number }> {
  if (isPurchaseDocument(docType, extraction)) {
    return registerSinglePurchaseInvoice(
      admin,
      userId,
      companyId,
      documentId,
      docType,
      extraction,
      regime,
      uploadDateYmd,
      sourcePage,
    );
  }
  return registerSingleSalesInvoice(
    admin,
    userId,
    companyId,
    documentId,
    extraction,
    regime,
    uploadDateYmd,
  );
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
    .select('id, company_id, processing_status, validation_status, document_type, metadata, content, created_at')
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
  const docType =
    (docRow.document_type as AtlasDocumentType | null) ??
    (classificationFromMetadata(metadata)?.detected_type ?? null);

  if (isBankStatementType(docType)) {
    const valid = validateBankStatementExtraction(structured, metadata);
    if (!valid.ok) {
      return {
        ok: false,
        error: 'validation_failed',
        message: `Relevé bancaire incomplet: ${valid.missing.join(', ')}`,
        details: [{ page: 1, missing: valid.missing }],
      };
    }

    try {
      const { statementId, transactionCount } = await registerBankStatementFromDocument(
        admin,
        userId,
        companyId,
        documentId,
        structured,
        metadata,
      );
      return {
        ok: true,
        documentKind: 'bank_statement',
        invoicesCreated: 0,
        invoicesSkipped: 0,
        invoiceIds: [],
        journalLineCount: 0,
        tvaAmount: 0,
        statementId,
        transactionCount,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: 'registration_failed',
        message,
        details: [{ page: 1, error: message }],
      };
    }
  }

  const resolvedDocType = docType ?? 'purchase_invoice';
  const invoicesPlan = resolveInvoicesToRegister(atlasDoc, structured);
  const uploadDateYmd = uploadDateFromDocument(docRow);

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
      const isPurchase = isPurchaseDocument(resolvedDocType, extraction);
      const existing = isPurchase
        ? await findExistingSupplierInvoice(
            admin,
            userId,
            documentId,
            0,
            extractStr(extraction.invoice_number),
          )
        : await findExistingClientInvoice(admin, userId, documentId, extractStr(extraction.invoice_number));
      if (existing) {
        invoiceIds.push(existing);
        invoicesSkipped += 1;
      } else {
        const r = await registerInvoiceFromExtraction(
          admin,
          userId,
          companyId,
          documentId,
          resolvedDocType,
          extraction,
          regime,
          uploadDateYmd,
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
      const isPurchase = isPurchaseDocument(resolvedDocType, extraction);
      try {
        const existing = isPurchase
          ? await findExistingSupplierInvoice(
              admin,
              userId,
              documentId,
              sourcePage,
              detected.invoice_number,
            )
          : await findExistingClientInvoice(admin, userId, documentId, detected.invoice_number);
        if (existing) {
          invoiceIds.push(existing);
          invoicesSkipped += 1;
          continue;
        }

        const r = await registerInvoiceFromExtraction(
          admin,
          userId,
          companyId,
          documentId,
          resolvedDocType,
          extraction,
          regime,
          uploadDateYmd,
          isPurchase ? sourcePage : undefined,
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
    documentKind: 'invoice',
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
          document_kind: registration.documentKind,
          invoices_created: registration.invoicesCreated,
          invoices_skipped: registration.invoicesSkipped,
          invoice_ids: registration.invoiceIds,
          journal_line_count: registration.journalLineCount,
          tva_amount: registration.tvaAmount,
          statement_id: registration.statementId ?? null,
          transaction_count: registration.transactionCount ?? null,
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
