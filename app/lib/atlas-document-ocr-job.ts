/**
 * Server-side OCR jobs for Documents IA (PDF multipage + images).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ATLAS_DOCUMENTS_BUCKET } from '@/app/lib/atlas-document-storage';
import { frenchOcrErrorMessage } from '@/app/lib/atlas-document-ocr-errors';
import {
  markDocumentOcrJobStarted,
  persistDocumentOcrResult,
  updateDocumentOcrPageCount,
  updateDocumentOcrProgress,
} from '@/app/lib/atlas-documents-ocr-server';
import { getPdfPageCount } from '@/app/lib/atlas-pdf-ocr-render';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { prepareUploadedImageForOcr } from '@/app/lib/atlas-document-image-upload';
import { isPdfMimeType } from '@/app/lib/atlas-document-storage';
import { processMultiPagePdfOcr } from '@/app/lib/atlas-pdf-ocr-multipage';
import { PDF_OCR_RENDERED_MIME } from '@/app/lib/atlas-pdf-ocr-render';
import { runInvoiceOcrExtraction } from '@/app/lib/atlas-ocr-invoice-server';

type DocumentRow = {
  id: string;
  mime_type: string | null;
  storage_path: string | null;
  filename: string | null;
  size_bytes: number | null;
  metadata: unknown;
};

function asMetaRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function workingPathFromMetadata(meta: Record<string, unknown>): string | null {
  const storage = asMetaRecord(meta.storage);
  const wp = storage.working_storage_path;
  return typeof wp === 'string' && wp ? wp : null;
}

export async function runPdfOcrJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  row: DocumentRow,
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const mimeType = String(row.mime_type ?? '').toLowerCase();
  const storagePath = String(row.storage_path ?? '');

  if (!isPdfMimeType(mimeType)) {
    return { ok: false, status: 400, code: 'pdf_required', message: 'Not a PDF document' };
  }
  if (!storagePath) {
    return { ok: false, status: 400, code: 'storage_path_missing', message: 'Missing storage path' };
  }

  await markDocumentOcrJobStarted(supabase, userId, documentId, {
    filename: row.filename,
    mimeType: mimeType,
    sizeBytes: row.size_bytes,
  });

  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from(ATLAS_DOCUMENTS_BUCKET)
    .download(storagePath);

  if (downloadErr || !fileBlob) {
    await persistDocumentOcrResult(supabase, userId, documentId, {
      processingStatus: 'failed',
      ocrError: {
        step: 'storage_download',
        code: 'storage_download_failed',
        message: frenchOcrErrorMessage('storage_download_failed', downloadErr?.message),
      },
      pdfMeta: {
        original_mime_type: mimeType,
        processed_page: 1,
        rendered_image_mime_type: PDF_OCR_RENDERED_MIME,
      },
      preserveFileMeta: {
        filename: row.filename,
        mimeType,
        sizeBytes: row.size_bytes,
        existingMetadata: row.metadata,
      },
    });
    return {
      ok: false,
      status: 500,
      code: 'storage_download_failed',
      message: downloadErr?.message ?? 'Download failed',
    };
  }

  let multiPageResult;
  try {
    const pdfBytes = Buffer.from(await fileBlob.arrayBuffer());
    try {
      const pageCount = await getPdfPageCount(pdfBytes);
      if (pageCount > 0) {
        await updateDocumentOcrPageCount(supabase, userId, documentId, pageCount);
      }
    } catch {
      /* page count best-effort */
    }

    multiPageResult = await processMultiPagePdfOcr(pdfBytes, {
      onProgress: async (event) => {
        await updateDocumentOcrProgress(supabase, userId, documentId, {
          phase: event.phase,
          page: event.pageNumber,
          total: event.totalPages,
        });
      },
    });
  } catch (err) {
    const message = frenchOcrErrorMessage(
      'pdf_render_failed',
      err instanceof Error ? err.message : undefined,
    );
    await persistDocumentOcrResult(supabase, userId, documentId, {
      processingStatus: 'failed',
      ocrError: { step: 'pdf_render', code: 'pdf_render_failed', message },
      pdfMeta: {
        original_mime_type: mimeType,
        processed_page: 1,
        rendered_image_mime_type: PDF_OCR_RENDERED_MIME,
      },
      preserveFileMeta: {
        filename: row.filename,
        mimeType,
        sizeBytes: row.size_bytes,
        existingMetadata: row.metadata,
      },
    });
    return { ok: false, status: 422, code: 'pdf_render_failed', message };
  }

  const pdfMeta = {
    original_mime_type: mimeType,
    total_pages: multiPageResult.totalPages,
    processed_pages: multiPageResult.processedPages,
    processed_page_count: multiPageResult.processedPages,
    pages: multiPageResult.pageResults,
    partial_failure: multiPageResult.partialFailure,
    invoices: multiPageResult.invoices,
    processed_page: multiPageResult.processedPages,
    rendered_image_mime_type: multiPageResult.renderedMime,
  };

  if (multiPageResult.processingStatus === 'failed') {
    const firstErr = multiPageResult.pageResults.find((p) => !p.success)?.error;
    await persistDocumentOcrResult(supabase, userId, documentId, {
      processingStatus: 'failed',
      extraction: multiPageResult.merged,
      extractedText: JSON.stringify({ pages: multiPageResult.pageResults }, null, 2),
      ocrError: firstErr
        ? {
            ...firstErr,
            message: frenchOcrErrorMessage(firstErr.code, firstErr.message),
          }
        : {
            step: 'ai_provider',
            code: 'ocr_failed',
            message: frenchOcrErrorMessage('ocr_failed'),
          },
      pdfMeta,
      preserveFileMeta: {
        filename: row.filename,
        mimeType,
        sizeBytes: row.size_bytes,
        existingMetadata: row.metadata,
      },
    });
    return {
      ok: false,
      status: 422,
      code: firstErr?.code ?? 'ocr_failed',
      message: firstErr?.message ?? 'All PDF pages failed OCR',
    };
  }

  const persist = await persistDocumentOcrResult(supabase, userId, documentId, {
    processingStatus: 'processed',
    extraction: multiPageResult.merged,
    extractedText: JSON.stringify(
      { merged: multiPageResult.merged, pages: multiPageResult.pageResults, invoices: multiPageResult.invoices },
      null,
      2,
    ),
    pdfMeta,
    preserveFileMeta: {
      filename: row.filename,
      mimeType,
      sizeBytes: row.size_bytes,
      existingMetadata: row.metadata,
    },
  });

  if (!persist.ok) {
    return { ok: false, status: 500, code: 'db_update_failed', message: persist.error };
  }

  return { ok: true };
}

export async function runImageOcrJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  row: DocumentRow,
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const mimeType = String(row.mime_type ?? '').toLowerCase();
  const meta = asMetaRecord(row.metadata);
  const workingPath = workingPathFromMetadata(meta);
  const storagePath = workingPath ?? String(row.storage_path ?? '');

  if (!storagePath || isPdfMimeType(mimeType)) {
    return { ok: false, status: 400, code: 'image_required', message: 'Not an image document' };
  }

  await markDocumentOcrJobStarted(supabase, userId, documentId, {
    filename: row.filename,
    mimeType,
    sizeBytes: row.size_bytes,
  }, { pageCount: 1 });

  await updateDocumentOcrProgress(supabase, userId, documentId, {
    phase: 'analyzing',
    page: 1,
    total: 1,
  });

  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from(ATLAS_DOCUMENTS_BUCKET)
    .download(storagePath);

  if (downloadErr || !fileBlob) {
    await persistDocumentOcrResult(supabase, userId, documentId, {
      processingStatus: 'failed',
      ocrError: {
        step: 'storage_download',
        code: 'storage_download_failed',
        message: frenchOcrErrorMessage('storage_download_failed', downloadErr?.message),
      },
      preserveFileMeta: {
        filename: row.filename,
        mimeType,
        sizeBytes: row.size_bytes,
        existingMetadata: row.metadata,
      },
    });
    return {
      ok: false,
      status: 500,
      code: 'storage_download_failed',
      message: downloadErr?.message ?? 'Download failed',
    };
  }

  let ocrBuffer: Buffer;
  let ocrMime: 'image/jpeg' | 'image/png';

  try {
    const raw = Buffer.from(await fileBlob.arrayBuffer());
    if (workingPath) {
      ocrBuffer = raw;
      ocrMime = mimeType.includes('png') ? 'image/png' : 'image/jpeg';
    } else {
      const prepared = await prepareUploadedImageForOcr(raw, mimeType);
      ocrBuffer = prepared.ocrBuffer;
      ocrMime = prepared.ocrMimeType;
    }
  } catch {
    await persistDocumentOcrResult(supabase, userId, documentId, {
      processingStatus: 'failed',
      ocrError: {
        step: 'image_compress',
        code: 'image_compress_failed',
        message: frenchOcrErrorMessage('image_compress_failed'),
      },
      preserveFileMeta: {
        filename: row.filename,
        mimeType,
        sizeBytes: row.size_bytes,
        existingMetadata: row.metadata,
      },
    });
    return { ok: false, status: 422, code: 'image_compress_failed', message: 'Compression failed' };
  }

  const ocrResult = await runInvoiceOcrExtraction(ocrBuffer.toString('base64'), ocrMime);

  if (!ocrResult.ok) {
    await persistDocumentOcrResult(supabase, userId, documentId, {
      processingStatus: 'failed',
      ocrError: {
        step: ocrResult.step,
        code: ocrResult.code,
        message: frenchOcrErrorMessage(ocrResult.code, ocrResult.message),
      },
      preserveFileMeta: {
        filename: row.filename,
        mimeType,
        sizeBytes: row.size_bytes,
        existingMetadata: row.metadata,
      },
    });
    return {
      ok: false,
      status: 422,
      code: ocrResult.code,
      message: ocrResult.message,
    };
  }

  const persist = await persistDocumentOcrResult(supabase, userId, documentId, {
    processingStatus: 'processed',
    extraction: ocrResult.extraction,
    extractedText: JSON.stringify(ocrResult.extraction, null, 2),
    preserveFileMeta: {
      filename: row.filename,
      mimeType,
      sizeBytes: row.size_bytes,
      existingMetadata: row.metadata,
    },
  });

  if (!persist.ok) {
    return { ok: false, status: 500, code: 'db_update_failed', message: persist.error };
  }

  return { ok: true };
}

export async function runDocumentOcrJob(
  userId: string,
  documentId: string,
  row: DocumentRow,
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const mimeType = String(row.mime_type ?? '').toLowerCase();
  if (isPdfMimeType(mimeType)) {
    return runPdfOcrJob(supabase, userId, documentId, row);
  }
  return runImageOcrJob(supabase, userId, documentId, row);
}
