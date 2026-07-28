/**
 * End-to-end auto pipeline: OCR complete → auto-validate → cross-module registration.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasDocument,
  AtlasDocumentClassification,
  AtlasDocumentType,
  AtlasDocumentValidationStatus,
  AtlasOcrDetectedInvoice,
  AtlasStructuredExtraction,
} from '@/app/types/atlas-document';
import { asRecord } from '@/app/lib/atlas-json';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { ocrInvoicesFromDocument } from '@/app/lib/atlas-documents-repository';
import { creatableOcrInvoices } from '@/app/lib/atlas-ocr-invoices-detect';
import {
  markDocumentValidated,
  registerValidatedDocumentRecords,
  type DocumentValidationResult,
} from '@/app/lib/atlas-document-validation-server';
import { revalidateDocumentSurfaces } from '@/app/lib/revalidate-document-surfaces';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

const AUTO_CONFIDENCE_THRESHOLD = 0.75;

export type AutoPipelineResult = {
  ok: boolean;
  validationStatus: AtlasDocumentValidationStatus;
  registration?: DocumentValidationResult;
  reason?: string;
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
  updated_at?: string | null;
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
    validationStatus: (row.validation_status as AtlasDocumentValidationStatus) ?? 'pending_review',
    metadata,
    content: row.content ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function structuredFromMetadata(metadata: Record<string, unknown>): AtlasStructuredExtraction {
  const raw = metadata.extraction;
  if (!raw || typeof raw !== 'object') return {};
  return raw as AtlasStructuredExtraction;
}

function classificationFromMetadata(metadata: Record<string, unknown>): AtlasDocumentClassification | null {
  const raw = metadata.classification;
  if (!raw || typeof raw !== 'object') return null;
  return raw as AtlasDocumentClassification;
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

function fieldConfidence(field?: { confidence?: number } | null): number {
  return typeof field?.confidence === 'number' ? field.confidence : 0;
}

function detectedHasBasicTotals(invoice: AtlasOcrDetectedInvoice): boolean {
  return (invoice.amount_ttc ?? 0) > 0 || (invoice.amount_ht ?? 0) > 0;
}

function structuredHasBasicTotals(extraction: AtlasStructuredExtraction): boolean {
  const ht = extractNum(extraction.subtotal_ht);
  const ttc = extractNum(extraction.total_ttc);
  const tva = extractNum(extraction.tva_amount);
  return ht > 0 || ttc > 0 || tva > 0;
}

function structuredHasKeyFields(extraction: AtlasStructuredExtraction): boolean {
  const hasCounterparty =
    Boolean(extractStr(extraction.supplier_name)) || Boolean(extractStr(extraction.customer_name));
  const hasDate = Boolean(extractStr(extraction.invoice_date));
  const hasTotals = structuredHasBasicTotals(extraction);
  return hasTotals && (hasCounterparty || hasDate);
}

function structuredHighConfidence(extraction: AtlasStructuredExtraction): boolean {
  const fields = [
    extraction.subtotal_ht,
    extraction.total_ttc,
    extraction.tva_amount,
    extraction.invoice_date,
    extraction.supplier_name,
    extraction.customer_name,
  ];
  const confidences = fields.map(fieldConfidence).filter((c) => c > 0);
  if (!confidences.length) return false;
  const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  return avg >= AUTO_CONFIDENCE_THRESHOLD;
}

/**
 * Decide auto validation status after OCR.
 * Defaults to validated when basic totals exist; needs_correction only when critically empty.
 */
export function evaluateAutoValidationStatus(doc: AtlasDocument): {
  status: 'validated' | 'needs_correction';
  reason: string;
} {
  const metadata = asRecord(doc.metadata) ?? {};
  const structured = structuredFromMetadata(metadata);
  const classification = classificationFromMetadata(metadata);
  const detected = creatableOcrInvoices(ocrInvoicesFromDocument(doc));

  if (detected.length > 0) {
    const withTotals = detected.filter(detectedHasBasicTotals);
    if (withTotals.length > 0) {
      return {
        status: 'validated',
        reason: `auto_validated_${withTotals.length}_invoice(s)_with_totals`,
      };
    }
    return { status: 'needs_correction', reason: 'missing_invoice_totals' };
  }

  if (structuredHasKeyFields(structured)) {
    return { status: 'validated', reason: 'auto_validated_structured_key_fields' };
  }

  if (structuredHasBasicTotals(structured)) {
    return { status: 'validated', reason: 'auto_validated_basic_totals' };
  }

  if (
    classification &&
    classification.type_confidence >= AUTO_CONFIDENCE_THRESHOLD &&
    structuredHasBasicTotals(structured)
  ) {
    return { status: 'validated', reason: 'auto_validated_high_confidence' };
  }

  if (structuredHighConfidence(structured) && structuredHasBasicTotals(structured)) {
    return { status: 'validated', reason: 'auto_validated_field_confidence' };
  }

  return { status: 'needs_correction', reason: 'critically_incomplete_extraction' };
}

async function markDocumentNeedsCorrection(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
  reason: string,
  registrationError?: string,
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
      validation_status: 'needs_correction',
      updated_at: now,
      metadata: {
        ...meta,
        auto_pipeline: {
          status: 'needs_correction',
          reason,
          registration_error: registrationError ?? null,
          processed_at: now,
        },
      },
    })
    .eq('id', documentId)
    .eq('user_id', userId);
}

/**
 * Run auto-validation + cross-module registration after OCR success.
 */
export async function runDocumentAutoPipeline(
  userId: string,
  documentId: string,
  source: 'ocr_runner' | 'register' | 'retrigger' | 'api_run' = 'ocr_runner',
): Promise<AutoPipelineResult> {
  const admin = getSupabaseServiceRoleClient();

  const { data: row, error } = await admin
    .from('atlas_documents')
    .select(
      'id, company_id, processing_status, validation_status, document_type, metadata, content, created_at, updated_at',
    )
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !row) {
    logAtlasServerEvent('documents/auto-pipeline', 'error', 'document_missing', { documentId, userId, source });
    return { ok: false, validationStatus: 'pending_review', reason: 'document_not_found' };
  }

  const docRow = row as DocumentRow;
  if (docRow.processing_status !== 'processed') {
    return { ok: false, validationStatus: 'pending_review', reason: 'not_processed' };
  }

  const existingSummary = asRecord(asRecord(docRow.metadata)?.validation_summary);
  if (docRow.validation_status === 'validated' && existingSummary?.invoice_ids) {
    logAtlasServerEvent('documents/auto-pipeline', 'info', 'skip_already_validated', { documentId, userId });
    revalidateDocumentSurfaces();
    return { ok: true, validationStatus: 'validated', reason: 'already_validated' };
  }

  const atlasDoc = rowToAtlasDocument(docRow);
  const decision = evaluateAutoValidationStatus(atlasDoc);

  logAtlasServerEvent('documents/auto-pipeline', 'info', 'decision', {
    documentId,
    userId,
    source,
    status: decision.status,
    reason: decision.reason,
  });

  if (decision.status === 'needs_correction') {
    await markDocumentNeedsCorrection(admin, userId, documentId, decision.reason);
    revalidateDocumentSurfaces();
    return { ok: true, validationStatus: 'needs_correction', reason: decision.reason };
  }

  const registration = await registerValidatedDocumentRecords(admin, userId, documentId);

  if (!registration.ok) {
    logAtlasServerEvent('documents/auto-pipeline', 'warn', 'registration_failed', {
      documentId,
      userId,
      error: registration.error,
      message: registration.message,
    });
    await markDocumentNeedsCorrection(admin, userId, documentId, decision.reason, registration.message);
    revalidateDocumentSurfaces();
    return {
      ok: false,
      validationStatus: 'needs_correction',
      registration,
      reason: registration.message,
    };
  }

  await markDocumentValidated(
    admin,
    userId,
    documentId,
    docRow.company_id ? String(docRow.company_id) : null,
    docRow.validation_status,
    registration,
  );

  const now = new Date().toISOString();
  const meta = asRecord(docRow.metadata);
  await admin
    .from('atlas_documents')
    .update({
      metadata: {
        ...meta,
        auto_pipeline: {
          status: 'validated',
          reason: decision.reason,
          source,
          processed_at: now,
          ...registration,
        },
      },
      updated_at: now,
    })
    .eq('id', documentId)
    .eq('user_id', userId);

  revalidateDocumentSurfaces();

  logAtlasServerEvent('documents/auto-pipeline', 'info', 'complete', {
    documentId,
    userId,
    invoicesCreated: registration.invoicesCreated,
    journalLineCount: registration.journalLineCount,
    tvaAmount: registration.tvaAmount,
  });

  return {
    ok: true,
    validationStatus: 'validated',
    registration,
    reason: decision.reason,
  };
}
