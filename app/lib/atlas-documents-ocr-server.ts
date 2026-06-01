import type { SupabaseClient } from '@supabase/supabase-js';

import type { AtlasOcrError, AtlasOcrExtraction } from '@/app/types/atlas-document';

import type { AtlasOcrPageMeta } from '@/app/lib/atlas-pdf-ocr-multipage';

const STUCK_OCR_MS = 5 * 60 * 1000;
const MAX_OCR_RETRIES = 1;

export type OcrProgressPhase = 'started' | 'rendering' | 'analyzing';

function asMetaRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function progressPercent(page: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((page / total) * 100));
}

async function fetchDocumentMetadata(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('atlas_documents')
    .select('metadata')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();
  return asMetaRecord(data?.metadata);
}

/** Live OCR progress for Documents IA polling (metadata.ocr.progress_*). */
export async function updateDocumentOcrProgress(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  progress: { phase: OcrProgressPhase; page: number; total: number },
): Promise<void> {
  const meta = await fetchDocumentMetadata(supabase, userId, documentId);
  const ocr = asMetaRecord(meta.ocr);
  const total = progress.total;
  const page = progress.page;

  await supabase
    .from('atlas_documents')
    .update({
      processing_status: 'processing',
      metadata: {
        ...meta,
        ocr: {
          ...ocr,
          progress_phase: progress.phase,
          progress_page: page,
          progress_total: total,
          pages_processed: page,
          page_count: total > 0 ? total : ocr.page_count,
          progress_percent: progressPercent(page, total),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', userId);
}

export async function markDocumentOcrJobStarted(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  file: { filename: string | null; mimeType: string | null; sizeBytes: number | null; retryCount?: number },
  opts?: { pageCount?: number },
): Promise<void> {
  const meta = await fetchDocumentMetadata(supabase, userId, documentId);
  const ocr = asMetaRecord(meta.ocr);
  const total = opts?.pageCount ?? (typeof ocr.page_count === 'number' ? ocr.page_count : 0);
  const now = new Date().toISOString();

  await supabase
    .from('atlas_documents')
    .update({
      processing_status: 'processing',
      metadata: {
        ...meta,
        ocr: {
          ...ocr,
          progress_phase: 'started',
          progress_page: 0,
          progress_total: total,
          pages_processed: 0,
          page_count: total,
          progress_percent: 0,
          started_at: (file.retryCount ?? 0) > 0 ? now : (ocr.started_at ?? now),
          file_name: file.filename ?? ocr.file_name,
          mime_type: file.mimeType ?? ocr.mime_type,
          size_bytes: file.sizeBytes ?? ocr.size_bytes,
          retry_count: file.retryCount ?? ocr.retry_count ?? 0,
        },
      },
      updated_at: now,
    })
    .eq('id', documentId)
    .eq('user_id', userId);
}

export async function updateDocumentOcrPageCount(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  pageCount: number,
): Promise<void> {
  const meta = await fetchDocumentMetadata(supabase, userId, documentId);
  const ocr = asMetaRecord(meta.ocr);

  await supabase
    .from('atlas_documents')
    .update({
      metadata: {
        ...meta,
        ocr: {
          ...ocr,
          page_count: pageCount,
          progress_total: pageCount,
          progress_phase: ocr.progress_phase === 'started' ? 'started' : ocr.progress_phase,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', userId);
}

export async function markDocumentOcrFailed(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  row: { filename: string | null; mime_type: string | null; size_bytes: number | null; metadata: unknown; processing_status?: string | null },
  ocrError: { code: string; step: string; message: string },
): Promise<void> {
  if (row.processing_status === 'processed') {
    return;
  }
  await persistDocumentOcrResult(supabase, userId, documentId, {
    processingStatus: 'failed',
    ocrError: { step: ocrError.step, code: ocrError.code, message: ocrError.message },
    preserveFileMeta: {
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      existingMetadata: row.metadata,
    },
  });
}

export type StuckOcrDecision =
  | { action: 'proceed' }
  | { action: 'retry'; retryCount: number }
  | { action: 'fail' }
  | { action: 'skip_duplicate' };

/** Stuck-job recovery: >5 min without real progress → one retry, then fail. */
export function shouldRecoverStuckDocumentOcr(row: {
  processing_status: string | null;
  metadata: unknown;
  updated_at: string | null;
}): StuckOcrDecision {
  if (row.processing_status === 'processed') {
    return { action: 'skip_duplicate' };
  }

  if (row.processing_status !== 'processing') {
    return { action: 'proceed' };
  }

  const meta = asMetaRecord(row.metadata);
  const ocr = asMetaRecord(meta.ocr);
  const startedAtRaw = ocr.started_at ?? row.updated_at;
  const startedMs = startedAtRaw ? Date.parse(String(startedAtRaw)) : 0;
  const ageMs = startedMs > 0 ? Date.now() - startedMs : 0;

  const phase = String(ocr.progress_phase ?? '');
  const progressPage = typeof ocr.progress_page === 'number' ? ocr.progress_page : 0;
  const hasRealProgress =
    (phase === 'rendering' || phase === 'analyzing') && progressPage > 0;
  const inFlight =
    phase === 'started' || phase === 'rendering' || phase === 'analyzing' || hasRealProgress;

  if (ageMs < STUCK_OCR_MS) {
    if (inFlight && ageMs < 120_000) {
      return { action: 'skip_duplicate' };
    }
    return { action: 'proceed' };
  }

  if (hasRealProgress) {
    return { action: 'skip_duplicate' };
  }

  const retryCount = typeof ocr.retry_count === 'number' ? ocr.retry_count : 0;
  if (retryCount >= MAX_OCR_RETRIES) {
    return { action: 'fail' };
  }

  return { action: 'retry', retryCount };
}

export type DocumentOcrPdfMeta = {
  original_mime_type: string;
  total_pages?: number;
  page_count?: number;
  processed_pages?: number;
  processed_page_count?: number;
  pages_processed?: number;
  pages?: AtlasOcrPageMeta[];
  invoices?: import('@/app/types/atlas-document').AtlasOcrDetectedInvoice[];
  partial_failure?: boolean;
  processed_page?: number;
  rendered_image_mime_type?: string;
  raw_error?: string;
};

export type PersistDocumentOcrInput = {
  processingStatus: 'processed' | 'failed';
  extraction?: AtlasOcrExtraction;
  extractedText?: string;
  ocrError?: AtlasOcrError;
  pdfMeta?: DocumentOcrPdfMeta;
  preserveFileMeta?: {
    filename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    existingMetadata: unknown;
  };
};

export async function persistDocumentOcrResult(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  input: PersistDocumentOcrInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseMeta = input.preserveFileMeta
    ? asMetaRecord(input.preserveFileMeta.existingMetadata)
    : await fetchDocumentMetadata(supabase, userId, documentId);

  const { data: currentRow } = await supabase
    .from('atlas_documents')
    .select('processing_status')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (currentRow?.processing_status === 'processed' && input.processingStatus === 'failed') {
    return { ok: true };
  }

  const extraction = input.extraction ?? {};
  const prevOcr = asMetaRecord(baseMeta.ocr);
  const now = new Date().toISOString();

  const ocrMeta: Record<string, unknown> = {
    ...prevOcr,
    ...extraction,
    ...(input.pdfMeta ?? {}),
    file_name: input.preserveFileMeta?.filename ?? prevOcr.file_name,
    mime_type: input.preserveFileMeta?.mimeType ?? prevOcr.mime_type,
    size_bytes: input.preserveFileMeta?.sizeBytes ?? prevOcr.size_bytes,
    completed_at: now,
    progress_percent: input.processingStatus === 'processed' ? 100 : prevOcr.progress_percent,
  };

  const resolvedPageCount = input.pdfMeta?.page_count ?? input.pdfMeta?.total_pages;
  if (resolvedPageCount != null) {
    ocrMeta.page_count = resolvedPageCount;
    ocrMeta.total_pages = resolvedPageCount;
    ocrMeta.pages_processed = input.pdfMeta?.pages_processed ?? input.pdfMeta?.processed_pages ?? input.pdfMeta?.processed_page_count ?? resolvedPageCount;
  }

  if (input.ocrError) {
    ocrMeta.error = input.ocrError;
    ocrMeta.progress_phase = 'failed';
  } else if (input.processingStatus === 'processed') {
    ocrMeta.progress_phase = 'completed';
    delete ocrMeta.error;
  }

  const extractedText =
    input.extractedText ??
    (input.processingStatus === 'processed'
      ? JSON.stringify(extraction, null, 2)
      : input.ocrError?.message ?? JSON.stringify(ocrMeta, null, 2));

  const { error } = await supabase
    .from('atlas_documents')
    .update({
      processing_status: input.processingStatus,
      extracted_text: extractedText,
      content: extraction,
      metadata: { ...baseMeta, ocr: ocrMeta },
      updated_at: now,
    })
    .eq('id', documentId)
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type DocumentOcrProgressSnapshot = {
  processingStatus: string;
  progressPhase?: OcrProgressPhase | 'completed' | 'failed';
  progressPage?: number;
  progressTotal?: number;
  progressPercent?: number;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  pageCount?: number;
  pagesProcessed?: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  errorCode?: string;
};

/** Server-side OCR progress read (Documents IA polling API). */
export async function readDocumentOcrProgress(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<{ ok: true; progress: DocumentOcrProgressSnapshot } | { ok: false; code: string }> {
  const { data, error } = await supabase
    .from('atlas_documents')
    .select('processing_status, metadata, extracted_text')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: 'document_not_found_or_forbidden' };
  }

  const ocr = asMetaRecord(asMetaRecord(data.metadata).ocr);
  const rawPhase = ocr.progress_phase;
  const progressPhase =
    rawPhase === 'started' ||
    rawPhase === 'rendering' ||
    rawPhase === 'analyzing' ||
    rawPhase === 'completed' ||
    rawPhase === 'failed'
      ? rawPhase
      : undefined;

  const err = ocr.error;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  if (err && typeof err === 'object' && !Array.isArray(err)) {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === 'string') errorMessage = rec.message;
    if (typeof rec.code === 'string') errorCode = rec.code;
  }

  return {
    ok: true,
    progress: {
      processingStatus: String(data.processing_status ?? 'uploaded'),
      progressPhase,
      progressPage: typeof ocr.progress_page === 'number' ? ocr.progress_page : undefined,
      progressTotal: typeof ocr.progress_total === 'number' ? ocr.progress_total : undefined,
      progressPercent: typeof ocr.progress_percent === 'number' ? ocr.progress_percent : undefined,
      fileName: typeof ocr.file_name === 'string' ? ocr.file_name : undefined,
      mimeType: typeof ocr.mime_type === 'string' ? ocr.mime_type : undefined,
      sizeBytes: typeof ocr.size_bytes === 'number' ? ocr.size_bytes : undefined,
      pageCount: typeof ocr.page_count === 'number' ? ocr.page_count : undefined,
      pagesProcessed: typeof ocr.pages_processed === 'number' ? ocr.pages_processed : undefined,
      startedAt: typeof ocr.started_at === 'string' ? ocr.started_at : undefined,
      completedAt: typeof ocr.completed_at === 'string' ? ocr.completed_at : undefined,
      errorMessage,
      errorCode,
    },
  };
}
