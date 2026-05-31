/**
 * Direct client → Supabase Storage upload (no file bytes through Vercel).
 * Flow: prepare (path + signed token) → Storage upload → register (metadata + OCR).
 */

import {
  ATLAS_DOCUMENTS_BUCKET,
  inferDocumentMimeType,
} from '@/app/lib/atlas-document-storage';
import { supabase } from '@/app/lib/supabase';

/** Above this size, never use multipart `/api/documents/upload`. */
export const DIRECT_STORAGE_UPLOAD_THRESHOLD_BYTES = 256 * 1024;

const STORAGE_UPLOAD_TIMEOUT_MS = 600_000;

export type DocumentUploadProgressPhase =
  | 'storage'
  | 'registered'
  | 'ocr'
  | 'idle';

export type DocumentUploadProgress = {
  phase: DocumentUploadProgressPhase;
  storagePercent?: number;
};

export type DocumentUploadResult = {
  document: {
    id: string;
    companyId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    processingStatus: string;
    compressed?: boolean;
  };
  ocrAccepted?: boolean;
};

export type DocumentUploadErrorBody = {
  error?: string;
  code?: string;
  step?: string;
  message?: string;
};

type PrepareResponse = {
  documentId: string;
  storagePath: string;
  bucket: string;
  signedUploadToken?: string | null;
  signedUploadPath?: string | null;
};

function mapStorageError(err: { message?: string; name?: string }): DocumentUploadErrorBody {
  const msg = err.message ?? '';
  if (/policy|permission|denied|unauthorized|403|row-level security/i.test(msg)) {
    return {
      error: 'storage_permission_denied',
      code: 'storage_permission_denied',
      step: 'client_storage_upload',
      message: msg,
    };
  }
  if (/too large|413|payload|size/i.test(msg)) {
    return {
      error: 'file_too_large',
      code: 'file_too_large',
      step: 'client_storage_upload',
      message: msg,
    };
  }
  return {
    error: 'storage_upload_failed',
    code: 'storage_upload_failed',
    step: 'client_storage_upload',
    message: msg,
  };
}

async function uploadToStorageWithProgress(
  file: File,
  mimeType: string,
  prepare: PrepareResponse,
  onProgress?: (percent: number) => void,
): Promise<{ ok: true } | { ok: false; body: DocumentUploadErrorBody }> {
  const bucket = prepare.bucket || ATLAS_DOCUMENTS_BUCKET;
  const path = prepare.signedUploadPath ?? prepare.storagePath;
  const token = prepare.signedUploadToken;

  if (token && path) {
    try {
      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
        contentType: mimeType,
        upsert: false,
      });
      if (error) {
        return { ok: false, body: mapStorageError(error) };
      }
      onProgress?.(100);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'storage_upload_failed';
      return { ok: false, body: mapStorageError({ message }) };
    }
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve({
        ok: false,
        body: {
          error: 'upload_timeout',
          code: 'upload_timeout',
          step: 'client_storage_upload',
          message: 'Storage upload timed out',
        },
      });
    }, STORAGE_UPLOAD_TIMEOUT_MS);

    void (async () => {
      const { error } = await supabase.storage.from(bucket).upload(prepare.storagePath, file, {
        contentType: mimeType,
        upsert: false,
      });
      window.clearTimeout(timer);
      if (error) {
        resolve({ ok: false, body: mapStorageError(error) });
        return;
      }
      onProgress?.(100);
      resolve({ ok: true });
    })();
  });
}

export function shouldUseDirectStorageUpload(file: File): boolean {
  return file.size > DIRECT_STORAGE_UPLOAD_THRESHOLD_BYTES;
}

/** Always use direct Storage in Supabase mode (durable on Vercel). */
export function mustUseDirectStorageUpload(): boolean {
  return true;
}

export async function uploadDocumentForOcr(
  file: File,
  companyId: string,
  options?: {
    onProgress?: (progress: DocumentUploadProgress) => void;
  },
): Promise<{ ok: true; data: DocumentUploadResult } | { ok: false; status: number; body: DocumentUploadErrorBody }> {
  const mimeType = inferDocumentMimeType(file);
  const onProgress = options?.onProgress;

  onProgress?.({ phase: 'storage', storagePercent: 0 });

  const prepareRes = await fetch('/api/documents/upload/prepare', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
    }),
  });

  const prepareBody = (await prepareRes.json().catch(() => ({}))) as PrepareResponse & DocumentUploadErrorBody;
  if (!prepareRes.ok || !prepareBody.documentId || !prepareBody.storagePath) {
    return { ok: false, status: prepareRes.status, body: prepareBody };
  }

  const storageResult = await uploadToStorageWithProgress(file, mimeType, prepareBody, (pct) => {
    onProgress?.({ phase: 'storage', storagePercent: pct });
  });

  if (!storageResult.ok) {
    await removeFailedStorageObject(prepareBody.storagePath);
    return { ok: false, status: 403, body: storageResult.body };
  }

  onProgress?.({ phase: 'registered' });

  const registerRes = await fetch('/api/documents/upload/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId: prepareBody.documentId,
      companyId,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      storagePath: prepareBody.storagePath,
    }),
  });

  const registerBody = (await registerRes.json().catch(() => ({}))) as DocumentUploadResult & DocumentUploadErrorBody;
  if (!registerRes.ok || !registerBody.document?.id) {
    await removeFailedStorageObject(prepareBody.storagePath);
    return { ok: false, status: registerRes.status, body: registerBody };
  }

  onProgress?.({ phase: 'ocr' });

  return {
    ok: true,
    data: {
      document: registerBody.document,
      ocrAccepted: registerBody.ocrAccepted ?? true,
    },
  };
}

async function removeFailedStorageObject(storagePath: string): Promise<void> {
  try {
    await supabase.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
  } catch {
    /* best effort */
  }
}
