/**
 * Post-storage register + OCR enqueue (heavy deps loaded dynamically).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { frenchMessageForRegisterCode } from '@/app/lib/atlas-document-register-errors';
import {
  assertStoragePathOwnedByUser,
  logUploadStep,
  verifyStorageObjectExists,
  type UploadLogContext,
} from '@/app/lib/atlas-document-upload-core';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  ATLAS_DOCUMENTS_BUCKET,
  buildAtlasDocumentWorkingStoragePath,
  formatMaxUploadLabel,
  isPdfMimeType,
  maxUploadBytesForMime,
  sanitizeDocumentFilename,
} from '@/app/lib/atlas-document-storage';

export type RegisterStoredDocumentInput = {
  userId: string;
  companyId: string;
  documentId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type RegisterStoredDocumentResult =
  | {
      ok: true;
      document: {
        id: string;
        companyId: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        storagePath: string;
        processingStatus: 'processing';
        compressed: boolean;
      };
      ocrAccepted: true;
    }
  | { ok: false; code: string; message: string; httpStatus: number };

function registerFailure(
  code: string,
  rawMessage: string | undefined,
  httpStatus: number,
  ctx: UploadLogContext,
  step: string,
): RegisterStoredDocumentResult {
  const message = frenchMessageForRegisterCode(code, rawMessage);
  logUploadStep(step, 'error', message, ctx, {
    code,
    rawMessage: rawMessage?.slice(0, 500),
    bucket: ATLAS_DOCUMENTS_BUCKET,
  });
  return { ok: false, code, message, httpStatus };
}

function asPlainMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  return meta && typeof meta === 'object' ? { ...meta } : {};
}

/** After client Storage upload: insert row, compress image, enqueue OCR from Storage. */
export async function registerStoredDocument(
  supabase: SupabaseClient,
  input: RegisterStoredDocumentInput,
): Promise<RegisterStoredDocumentResult> {
  const { userId, companyId, documentId, storagePath, filename, mimeType, sizeBytes } = input;
  const ctx: UploadLogContext = { userId, companyId, documentId, mimeType, fileSize: sizeBytes, storagePath };

  if (!assertStoragePathOwnedByUser(storagePath, userId)) {
    return registerFailure('storage_path_forbidden', undefined, 403, ctx, 'register_path');
  }

  const expectedPrefix = `${userId}/${companyId}/${documentId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return registerFailure('storage_path_forbidden', 'Path mismatch', 403, ctx, 'register_path');
  }

  const maxBytes = maxUploadBytesForMime(mimeType);
  if (sizeBytes > maxBytes) {
    return registerFailure('file_too_large', formatMaxUploadLabel(mimeType), 400, ctx, 'register_size');
  }

  const { data: companyRow, error: companyErr } = await supabase
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (companyErr || !companyRow?.id) {
    return registerFailure(
      'company_not_found_or_forbidden',
      companyErr?.message,
      403,
      ctx,
      'register_company',
    );
  }

  let admin: SupabaseClient;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'service_role_missing';
    return registerFailure('server_misconfigured', msg, 503, ctx, 'register_admin');
  }

  const verify = await verifyStorageObjectExists(admin, storagePath);
  if (!verify.ok) {
    const httpStatus = verify.code === 'storage_object_missing' ? 400 : 502;
    return registerFailure(verify.code, verify.message, httpStatus, ctx, 'register_storage_verify');
  }

  const safeName = sanitizeDocumentFilename(filename);
  let metadata: Record<string, unknown> = {
    storage: { original_storage_path: storagePath },
  };
  let compressed = false;

  if (!isPdfMimeType(mimeType)) {
    const { data: fileBlob, error: downloadErr } = await admin.storage
      .from(ATLAS_DOCUMENTS_BUCKET)
      .download(storagePath);

    if (downloadErr || !fileBlob) {
      const msg = downloadErr?.message ?? 'download failed';
      const code = /not found|404/i.test(msg) ? 'storage_object_missing' : 'storage_service_read_failed';
      return registerFailure(code, msg, code === 'storage_object_missing' ? 400 : 502, ctx, 'register_image_download');
    }

    try {
      const { prepareUploadedImageForOcr } = await import('@/app/lib/atlas-document-image-upload');
      const bytes = Buffer.from(await fileBlob.arrayBuffer());
      const prepared = await prepareUploadedImageForOcr(bytes, mimeType);
      if (prepared.compressed) {
        const workingPath = buildAtlasDocumentWorkingStoragePath(userId, companyId, documentId);
        const { error: workingErr } = await admin.storage
          .from(ATLAS_DOCUMENTS_BUCKET)
          .upload(workingPath, prepared.ocrBuffer, {
            contentType: prepared.ocrMimeType,
            upsert: true,
          });

        if (workingErr) {
          return registerFailure('working_copy_failed', workingErr.message, 500, ctx, 'register_working_copy');
        }

        compressed = true;
        metadata = {
          storage: {
            original_storage_path: storagePath,
            working_storage_path: workingPath,
            compressed: true,
            original_bytes: prepared.originalBytes,
            ocr_bytes: prepared.ocrBytes,
          },
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'image_compress_failed';
      return registerFailure('image_compress_failed', message, 422, ctx, 'register_image_compress');
    }
  }

  logUploadStep('register', 'info', 'db_insert_start', ctx);

  const { error: insertErr } = await admin.from('atlas_documents').insert({
    id: documentId,
    user_id: userId,
    company_id: companyId,
    type: 'ocr',
    title: safeName,
    kind: 'upload',
    source: 'ocr',
    status: 'active',
    filename: safeName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    storage_path: storagePath,
    processing_status: 'processing',
    metadata,
  });

  if (insertErr) {
    return registerFailure('db_insert_failed', insertErr.message, 500, ctx, 'register_db_insert');
  }

  const row = {
    id: documentId,
    mime_type: mimeType,
    storage_path: storagePath,
    filename: safeName,
    size_bytes: sizeBytes,
    metadata,
  };

  void import('@/app/lib/atlas-document-ocr-job')
    .then(({ runDocumentOcrJob }) => runDocumentOcrJob(userId, documentId, row))
    .then((result) => {
      if (!result.ok) {
        logUploadStep('ocr_enqueue', 'error', result.message, ctx, { code: result.code });
        void admin
          .from('atlas_documents')
          .update({
            processing_status: 'failed',
            metadata: {
              ...asPlainMetadata(metadata),
              ocr_error: {
                step: 'ocr_enqueue',
                code: result.code,
                message: result.message,
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', documentId)
          .eq('user_id', userId);
      }
    });

  logUploadStep('register_complete', 'info', 'document_registered', ctx, { compressed });

  return {
    ok: true,
    document: {
      id: documentId,
      companyId,
      filename: safeName,
      mimeType,
      sizeBytes,
      storagePath,
      processingStatus: 'processing',
      compressed,
    },
    ocrAccepted: true,
  };
}

export async function removeOrphanStorageObject(
  _supabase: SupabaseClient | null,
  storagePath: string,
): Promise<void> {
  try {
    const admin = getSupabaseServiceRoleClient();
    await admin.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
  } catch {
    /* best effort */
  }
}
