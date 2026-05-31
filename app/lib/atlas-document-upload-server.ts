/**
 * Documents IA — direct Storage upload (prepare → client upload → register).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { runDocumentOcrJob } from '@/app/lib/atlas-document-ocr-job';
import { prepareUploadedImageForOcr } from '@/app/lib/atlas-document-image-upload';
import {
  ATLAS_DOCUMENTS_BUCKET,
  buildAtlasDocumentStoragePath,
  buildAtlasDocumentWorkingStoragePath,
  formatMaxUploadLabel,
  isAllowedDocumentMime,
  isPdfMimeType,
  maxUploadBytesForMime,
  sanitizeDocumentFilename,
} from '@/app/lib/atlas-document-storage';

export type UploadLogContext = {
  userId: string;
  companyId?: string;
  documentId?: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string;
};

export function logUploadStep(
  step: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  ctx: UploadLogContext,
  extra?: Record<string, unknown>,
): void {
  logAtlasServerEvent('documents/upload', level, message, { step, ...ctx, ...extra });
}

export type PrepareStorageSlotInput = {
  userId: string;
  companyId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type PrepareStorageSlotResult =
  | {
      ok: true;
      documentId: string;
      storagePath: string;
      safeName: string;
      signedUploadToken?: string;
      signedUploadPath?: string;
    }
  | { ok: false; code: string; message: string; httpStatus: number };

/** Validates company + limits and allocates a storage path (no DB row yet). */
export async function prepareStorageUploadSlot(
  supabase: SupabaseClient,
  input: PrepareStorageSlotInput,
): Promise<PrepareStorageSlotResult> {
  const { userId, companyId, filename, mimeType, sizeBytes } = input;
  const maxBytes = maxUploadBytesForMime(mimeType);

  if (!isAllowedDocumentMime(mimeType)) {
    return { ok: false, code: 'mime_not_allowed', message: `MIME not allowed: ${mimeType}`, httpStatus: 400 };
  }
  if (sizeBytes > maxBytes) {
    return {
      ok: false,
      code: 'file_too_large',
      message: `Exceeds ${formatMaxUploadLabel(mimeType)}`,
      httpStatus: 400,
    };
  }

  const { data: companyRow, error: companyErr } = await supabase
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (companyErr || !companyRow?.id) {
    return {
      ok: false,
      code: 'company_not_found_or_forbidden',
      message: companyErr?.message ?? 'Company not owned',
      httpStatus: 403,
    };
  }

  const documentId = crypto.randomUUID();
  const safeName = sanitizeDocumentFilename(filename);
  const storagePath = buildAtlasDocumentStoragePath(userId, companyId, documentId, safeName);

  let signedUploadToken: string | undefined;
  let signedUploadPath: string | undefined;

  try {
    const { data: signed, error: signErr } = await supabase.storage
      .from(ATLAS_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (!signErr && signed?.token && signed?.path) {
      signedUploadToken = signed.token;
      signedUploadPath = signed.path;
    }
  } catch {
    /* fallback to authenticated client .upload() */
  }

  return {
    ok: true,
    documentId,
    storagePath,
    safeName,
    signedUploadToken,
    signedUploadPath,
  };
}

export function assertStoragePathOwnedByUser(storagePath: string, userId: string): boolean {
  const prefix = `${userId}/`;
  return storagePath.startsWith(prefix) && !storagePath.includes('..');
}

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

/** After client Storage upload: insert row, compress image, enqueue OCR from Storage. */
export async function registerStoredDocument(
  supabase: SupabaseClient,
  input: RegisterStoredDocumentInput,
): Promise<RegisterStoredDocumentResult> {
  const { userId, companyId, documentId, storagePath, filename, mimeType, sizeBytes } = input;

  if (!assertStoragePathOwnedByUser(storagePath, userId)) {
    return { ok: false, code: 'storage_path_forbidden', message: 'Invalid storage path', httpStatus: 403 };
  }

  const expectedPrefix = `${userId}/${companyId}/${documentId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return {
      ok: false,
      code: 'storage_path_forbidden',
      message: 'Storage path does not match document',
      httpStatus: 403,
    };
  }

  const maxBytes = maxUploadBytesForMime(mimeType);
  if (sizeBytes > maxBytes) {
    return {
      ok: false,
      code: 'file_too_large',
      message: `Exceeds ${formatMaxUploadLabel(mimeType)}`,
      httpStatus: 400,
    };
  }

  const { data: companyRow, error: companyErr } = await supabase
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (companyErr || !companyRow?.id) {
    return {
      ok: false,
      code: 'company_not_found_or_forbidden',
      message: companyErr?.message ?? 'Company not owned',
      httpStatus: 403,
    };
  }

  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from(ATLAS_DOCUMENTS_BUCKET)
    .download(storagePath);

  if (downloadErr || !fileBlob) {
    const msg = downloadErr?.message ?? '';
    const isRls =
      /policy|permission|denied|unauthorized|403|row-level security/i.test(msg) ||
      downloadErr?.name === 'StorageApiError';
    return {
      ok: false,
      code: isRls ? 'storage_permission_denied' : 'storage_object_missing',
      message: msg || 'File not found in storage',
      httpStatus: isRls ? 403 : 400,
    };
  }

  const safeName = sanitizeDocumentFilename(filename);
  let metadata: Record<string, unknown> = {
    storage: { original_storage_path: storagePath },
  };
  let compressed = false;

  if (!isPdfMimeType(mimeType)) {
    try {
      const bytes = Buffer.from(await fileBlob.arrayBuffer());
      const prepared = await prepareUploadedImageForOcr(bytes, mimeType);
      if (prepared.compressed) {
        const workingPath = buildAtlasDocumentWorkingStoragePath(userId, companyId, documentId);
        const { error: workingErr } = await supabase.storage
          .from(ATLAS_DOCUMENTS_BUCKET)
          .upload(workingPath, prepared.ocrBuffer, {
            contentType: prepared.ocrMimeType,
            upsert: true,
          });

        if (workingErr) {
          return {
            ok: false,
            code: 'working_copy_failed',
            message: workingErr.message,
            httpStatus: 500,
          };
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
      return { ok: false, code: 'image_compress_failed', message, httpStatus: 422 };
    }
  }

  const { error: insertErr } = await supabase.from('atlas_documents').insert({
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
    return {
      ok: false,
      code: insertErr.code ?? 'db_insert_failed',
      message: insertErr.message,
      httpStatus: 500,
    };
  }

  const row = {
    id: documentId,
    mime_type: mimeType,
    storage_path: storagePath,
    filename: safeName,
    size_bytes: sizeBytes,
    metadata,
  };

  void runDocumentOcrJob(supabase, userId, documentId, row).then((result) => {
    if (!result.ok) {
      logUploadStep('ocr_enqueue', 'error', result.message, { userId, documentId, companyId }, {
        code: result.code,
      });
    }
  });

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
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  await supabase.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
}
