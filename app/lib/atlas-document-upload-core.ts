/**
 * Upload prepare + logging only — must not import pdf-to-img / OCR (breaks /prepare on Vercel).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import {
  ATLAS_DOCUMENTS_BUCKET,
  buildAtlasDocumentStoragePath,
  documentUploadLimitExceededMessage,
  isAllowedDocumentMime,
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
      message: documentUploadLimitExceededMessage(mimeType),
      httpStatus: 413,
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

/** Verify object exists without downloading (safe for large PDFs on Vercel). */
export async function verifyStorageObjectExists(
  admin: SupabaseClient,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const segments = storagePath.split('/').filter(Boolean);
  if (segments.length < 4) {
    return { ok: false, code: 'storage_path_forbidden', message: 'Invalid storage path' };
  }
  const fileName = segments[segments.length - 1]!;
  const folder = segments.slice(0, -1).join('/');

  const { data, error } = await admin.storage.from(ATLAS_DOCUMENTS_BUCKET).list(folder, {
    limit: 100,
    search: fileName,
  });

  if (error) {
    return {
      ok: false,
      code: 'storage_verify_failed',
      message: error.message,
    };
  }

  const found = (data ?? []).some((obj) => obj.name === fileName);
  if (!found) {
    return {
      ok: false,
      code: 'storage_object_missing',
      message: 'Object not found in atlas-documents',
    };
  }

  return { ok: true };
}
