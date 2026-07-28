/**
 * Server-side OCR lifecycle (Vercel waitUntil-safe).
 */

import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { ensureAtlasDomPolyfills } from '@/app/lib/atlas-dom-polyfill';
import { runDocumentOcrJob } from '@/app/lib/atlas-document-ocr-job';
import {
  markDocumentOcrFailed,
  markDocumentOcrJobStarted,
  shouldRecoverStuckDocumentOcr,
} from '@/app/lib/atlas-documents-ocr-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { frenchOcrErrorMessage } from '@/app/lib/atlas-document-ocr-errors';

const OCR_JOB_TIMEOUT_MS = 280_000;

type DocumentRow = {
  id: string;
  user_id: string;
  mime_type: string | null;
  storage_path: string | null;
  filename: string | null;
  size_bytes: number | null;
  metadata: unknown;
  processing_status: string | null;
  updated_at: string | null;
};

function asMetaRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('ocr_job_timeout')), ms);
    }),
  ]);
}

async function loadDocumentRow(documentId: string, userId: string): Promise<DocumentRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('atlas_documents')
    .select(
      'id, user_id, mime_type, storage_path, filename, size_bytes, metadata, processing_status, updated_at',
    )
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data as DocumentRow;
}

/** Runs OCR with started/progress metadata, timeouts, and stuck recovery. */
export async function executeDocumentOcrServer(
  userId: string,
  documentId: string,
  source: 'register' | 'api_run' | 'retrigger' = 'api_run',
): Promise<void> {
  ensureAtlasDomPolyfills();
  logAtlasServerEvent('documents/ocr', 'info', 'ocr_runner_start', { documentId, userId, source });

  const row = await loadDocumentRow(documentId, userId);
  if (!row) {
    logAtlasServerEvent('documents/ocr', 'error', 'ocr_runner_document_missing', { documentId, userId });
    return;
  }

  if (row.processing_status === 'processed') {
    logAtlasServerEvent('documents/ocr', 'info', 'ocr_runner_skip_already_processed', { documentId, userId });
    const { runDocumentAutoPipeline } = await import('@/app/lib/atlas-document-auto-pipeline');
    await runDocumentAutoPipeline(userId, documentId, source);
    return;
  }

  const supabase = getSupabaseServiceRoleClient();
  const stuck = shouldRecoverStuckDocumentOcr(row);
  if (stuck.action === 'fail') {
    await markDocumentOcrFailed(supabase, userId, documentId, row, {
      code: 'ocr_stuck_timeout',
      step: 'stuck_recovery',
      message: frenchOcrErrorMessage('ocr_stuck_timeout'),
    });
    return;
  }

  if (stuck.action === 'skip_duplicate') {
    logAtlasServerEvent('documents/ocr', 'info', 'ocr_runner_skip_in_flight', { documentId, userId });
    return;
  }

  const retryCount = stuck.action === 'retry' ? stuck.retryCount + 1 : 0;

  await markDocumentOcrJobStarted(supabase, userId, documentId, {
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    retryCount,
  });

  const rowPayload = {
    id: String(row.id),
    mime_type: row.mime_type,
    storage_path: row.storage_path,
    filename: row.filename,
    size_bytes: row.size_bytes,
    metadata: row.metadata,
  };

  try {
    const result = await withTimeout(runDocumentOcrJob(userId, documentId, rowPayload), OCR_JOB_TIMEOUT_MS);
    if (!result.ok) {
      logAtlasServerEvent('documents/ocr', 'error', result.message, {
        documentId,
        userId,
        code: result.code,
        step: 'ocr_runner',
      });
      const fresh = await loadDocumentRow(documentId, userId);
      if (fresh?.processing_status === 'processing') {
        await markDocumentOcrFailed(supabase, userId, documentId, fresh, {
          code: result.code,
          step: 'ocr_runner',
          message: frenchOcrErrorMessage(result.code, result.message),
        });
      }
      return;
    }
    logAtlasServerEvent('documents/ocr', 'info', 'ocr_runner_complete', { documentId, userId });
    const { runDocumentAutoPipeline } = await import('@/app/lib/atlas-document-auto-pipeline');
    await runDocumentAutoPipeline(userId, documentId, 'ocr_runner');
  } catch (err) {
    const code = err instanceof Error && err.message === 'ocr_job_timeout' ? 'ocr_timeout' : 'ocr_failed';
    const message =
      code === 'ocr_timeout'
        ? frenchOcrErrorMessage('ocr_timeout')
        : frenchOcrErrorMessage('ocr_failed', err instanceof Error ? err.message : undefined);
    logAtlasServerEvent('documents/ocr', 'error', message, { documentId, userId, code });
    const fresh = await loadDocumentRow(documentId, userId);
    if (fresh?.processing_status === 'processing') {
      await markDocumentOcrFailed(supabase, userId, documentId, fresh, {
        code,
        step: 'ocr_runner',
        message,
      });
    }
  }
}
