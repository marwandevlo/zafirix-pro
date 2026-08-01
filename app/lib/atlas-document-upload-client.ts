/**
 * Direct client → Supabase Storage upload (no file bytes through Vercel).
 * Flow: prepare (path) → authenticated Storage.upload (retry) → register (metadata + OCR).
 */

import {
  ATLAS_DOCUMENTS_BUCKET,
  inferDocumentMimeType,
  isAllowedDocumentMime,
} from '@/app/lib/atlas-document-storage';
import { logUploadDiagnostic } from '@/app/lib/atlas-document-upload-diagnostics';
import { formatStorageErrorForUi, parseSupabaseStorageError } from '@/app/lib/atlas-storage-error';
import { frenchMessageForRegisterCode } from '@/app/lib/atlas-document-register-errors';
import {
  presentStoragePathForbiddenUploadError,
  type EnrichedDocumentUploadErrorBody,
} from '@/app/lib/atlas-document-upload-error-ui';
import { frenchMessageForUploadHttpStatus, sanitizeUploadUserMessage } from '@/app/lib/atlas-upload-http-errors';
import { supabase } from '@/app/lib/supabase';

/** Above this size, never use multipart `/api/documents/upload`. */
export const DIRECT_STORAGE_UPLOAD_THRESHOLD_BYTES = 256 * 1024;

/** Fail fast if Supabase Storage upload hangs (per attempt). */
const STORAGE_UPLOAD_TIMEOUT_MS = 15_000;
const API_REQUEST_TIMEOUT_MS = 15_000;
const SESSION_REFRESH_IF_EXPIRES_WITHIN_SEC = 300;
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_BASE_MS = 800;

export type DocumentUploadProgressPhase = 'storage' | 'registered' | 'ocr' | 'idle';

export type DocumentUploadProgress = {
  phase: DocumentUploadProgressPhase;
  storagePercent?: number;
  attempt?: number;
};

export type DocumentUploadResult = {
  success?: boolean;
  documentId?: string;
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

export type DocumentUploadErrorBody = EnrichedDocumentUploadErrorBody;

type PrepareResponse = {
  documentId: string;
  storagePath: string;
  bucket: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bodyFromStorageError(
  err: unknown,
  step = 'client_storage_upload',
): DocumentUploadErrorBody {
  const parsed = parseSupabaseStorageError(err);
  return {
    error: parsed.code,
    code: parsed.code,
    step,
    message: formatStorageErrorForUi(parsed),
  };
}

function isRetryableUploadError(body: DocumentUploadErrorBody): boolean {
  const code = body.code ?? body.error ?? '';
  if (code === 'storage_permission_denied' || code === 'file_too_large' || code === 'mime_not_allowed') {
    return false;
  }
  if (code === 'auth_required' || code === 'company_not_found_or_forbidden') {
    return false;
  }
  if (code === 'storage_duplicate') {
    return false;
  }
  return (
    code === 'upload_timeout' ||
    code === 'storage_upload_failed' ||
    code === 'server_error' ||
    code === 'use_direct_storage'
  );
}

function apiErrorBody(
  status: number,
  body: DocumentUploadErrorBody,
  step: string,
): DocumentUploadErrorBody {
  const code = body.error ?? body.code ?? 'upload_failed';
  const fromBody = sanitizeUploadUserMessage(body.message);
  const fromRegister = step === 'register' ? frenchMessageForRegisterCode(code, body.message) : null;
  const fromHttp = frenchMessageForUploadHttpStatus(status, code, step);
  return {
    error: code,
    code,
    step,
    message:
      fromBody ??
      (fromRegister && fromRegister !== code ? fromRegister : null) ??
      fromHttp ??
      'Échec du téléversement. Réessayez.',
  };
}

async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  step: string,
  opts?: { timeoutMs?: number },
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; body: DocumentUploadErrorBody }> {
  let lastStatus = 0;
  let lastBody: DocumentUploadErrorBody = { error: 'upload_failed', code: 'upload_failed', step };
  const timeoutMs = opts?.timeoutMs ?? API_REQUEST_TIMEOUT_MS;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, credentials: 'include', signal: controller.signal });
      window.clearTimeout(timer);
      lastStatus = res.status;
      const data = (await res.json().catch(() => ({}))) as T & DocumentUploadErrorBody;

      if (res.ok) {
        return { ok: true, status: res.status, data };
      }

      lastBody = {
        ...apiErrorBody(res.status, data, step),
        debug: (data as EnrichedDocumentUploadErrorBody).debug,
        forbiddenLog: (data as EnrichedDocumentUploadErrorBody).forbiddenLog,
      };
      logUploadDiagnostic({
        event: `${step}_failed`,
        step,
        httpStatus: res.status,
        errorCode: lastBody.code,
        errorMessage: lastBody.message,
        attempt,
        responseBody: data,
      });

      if (!isRetryableUploadError(lastBody) || attempt >= UPLOAD_MAX_ATTEMPTS) {
        return { ok: false, status: res.status, body: lastBody };
      }
    } catch (err) {
      window.clearTimeout(timer);
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      lastStatus = isAbort ? 408 : 0;
      lastBody = {
        error: 'upload_timeout',
        code: 'upload_timeout',
        step,
        message: isAbort
          ? 'Délai dépassé pendant la communication avec le serveur.'
          : 'Délai dépassé ou réseau indisponible.',
      };
      logUploadDiagnostic({
        event: `${step}_network_error`,
        step,
        errorMessage: err instanceof Error ? err.message : String(err),
        attempt,
      });
      if (attempt >= UPLOAD_MAX_ATTEMPTS) {
        return { ok: false, status: lastStatus || 408, body: lastBody };
      }
    }

    await sleep(UPLOAD_RETRY_BASE_MS * 2 ** (attempt - 1));
  }

  return { ok: false, status: lastStatus || 500, body: lastBody };
}

async function ensureAuthenticatedStorageSession(): Promise<
  { ok: true } | { ok: false; body: DocumentUploadErrorBody }
> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return {
      ok: false,
      body: {
        error: 'auth_required',
        code: 'auth_required',
        step: 'client_auth',
        message: 'Session expirée. Reconnectez-vous.',
      },
    };
  }
  if (!data.session?.access_token) {
    return {
      ok: false,
      body: {
        error: 'auth_required',
        code: 'auth_required',
        step: 'client_auth',
        message: 'Connectez-vous pour téléverser un document.',
      },
    };
  }

  const expiresAt = data.session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt > 0 && expiresAt - nowSec < SESSION_REFRESH_IF_EXPIRES_WITHIN_SEC) {
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) {
      return {
        ok: false,
        body: {
          error: 'auth_required',
          code: 'auth_required',
          step: 'client_auth_refresh',
          message: 'Session expirée. Reconnectez-vous.',
        },
      };
    }
  }

  return { ok: true };
}

async function uploadOnceViaAuthenticatedClient(
  file: File,
  mimeType: string,
  storagePath: string,
  bucket: string,
): Promise<{ ok: true } | { ok: false; body: DocumentUploadErrorBody }> {
  const auth = await ensureAuthenticatedStorageSession();
  if (!auth.ok) return auth;

  const contentType = isAllowedDocumentMime(mimeType) ? mimeType : inferDocumentMimeType(file);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; body: DocumentUploadErrorBody }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      finish({
        ok: false,
        body: {
          error: 'upload_timeout',
          code: 'upload_timeout',
          step: 'client_storage_upload',
          message: 'Délai dépassé pendant le téléversement vers le stockage (15 s).',
        },
      });
    }, STORAGE_UPLOAD_TIMEOUT_MS);

    void (async () => {
      try {
        const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
          contentType,
          upsert: false,
          cacheControl: '3600',
        });

        if (error) {
          finish({ ok: false, body: bodyFromStorageError(error) });
          return;
        }

        finish({ ok: true });
      } catch (err) {
        finish({ ok: false, body: bodyFromStorageError(err) });
      }
    })();
  });
}

async function uploadViaAuthenticatedClientWithRetry(
  file: File,
  mimeType: string,
  storagePath: string,
  bucket: string,
  companyId: string,
  documentId: string,
  onProgress?: (percent: number, attempt: number) => void,
): Promise<{ ok: true } | { ok: false; body: DocumentUploadErrorBody }> {
  let lastBody: DocumentUploadErrorBody = {
    error: 'storage_upload_failed',
    code: 'storage_upload_failed',
    step: 'client_storage_upload',
    message: 'Échec du téléversement vers le stockage.',
  };

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    onProgress?.(Math.min(90, attempt * 30), attempt);

    const result = await uploadOnceViaAuthenticatedClient(file, mimeType, storagePath, bucket);
    if (result.ok) {
      onProgress?.(100, attempt);
      return result;
    }

    lastBody = result.body;
    logUploadDiagnostic({
      event: 'storage_upload_failed',
      step: 'client_storage_upload',
      companyId,
      documentId,
      storagePath,
      bucket,
      fileSize: file.size,
      mimeType,
      httpStatus: lastBody.code === 'file_too_large' ? 413 : lastBody.code === 'storage_permission_denied' ? 403 : 500,
      errorCode: lastBody.code,
      errorMessage: lastBody.message,
      attempt,
    });

    if (!isRetryableUploadError(lastBody) || attempt >= UPLOAD_MAX_ATTEMPTS) {
      return result;
    }

    await sleep(UPLOAD_RETRY_BASE_MS * 2 ** (attempt - 1));
  }

  return { ok: false, body: lastBody };
}

export function shouldUseDirectStorageUpload(file: File): boolean {
  return file.size > DIRECT_STORAGE_UPLOAD_THRESHOLD_BYTES;
}

export function mustUseDirectStorageUpload(): boolean {
  return true;
}

/** Compute SHA-256 of a File using the WebCrypto API (browser-only). */
export async function computeFileSha256(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    const hex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hex;
  } catch {
    return null;
  }
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

  if (!mimeType || !isAllowedDocumentMime(mimeType)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'mime_not_allowed',
        code: 'mime_not_allowed',
        step: 'validation',
        message: 'Type de fichier non autorisé (images ou PDF uniquement).',
      },
    };
  }

  // Compute SHA256 for deduplication (best-effort, non-blocking)
  const sha256Hash = await computeFileSha256(file).catch(() => null);

  onProgress?.({ phase: 'storage', storagePercent: 0, attempt: 1 });

  const prepareResult = await fetchJsonWithRetry<PrepareResponse>(
    '/api/documents/upload/prepare',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
      }),
    },
    'prepare',
  );

  if (!prepareResult.ok) {
    return { ok: false, status: prepareResult.status, body: prepareResult.body };
  }

  const prepareBody = prepareResult.data;
  if (!prepareBody.documentId || !prepareBody.storagePath) {
    return {
      ok: false,
      status: 500,
      body: { error: 'server_error', code: 'server_error', step: 'prepare', message: 'Erreur serveur.' },
    };
  }

  const bucket = prepareBody.bucket || ATLAS_DOCUMENTS_BUCKET;

  logUploadDiagnostic({
    event: 'storage_upload_start',
    step: 'client_storage_upload',
    companyId,
    documentId: prepareBody.documentId,
    storagePath: prepareBody.storagePath,
    bucket,
    fileSize: file.size,
    mimeType,
  });

  const storageResult = await uploadViaAuthenticatedClientWithRetry(
    file,
    mimeType,
    prepareBody.storagePath,
    bucket,
    companyId,
    prepareBody.documentId,
    (pct, attempt) => onProgress?.({ phase: 'storage', storagePercent: pct, attempt }),
  );

  if (!storageResult.ok) {
    await removeFailedStorageObject(prepareBody.storagePath);
    const status =
      storageResult.body.code === 'file_too_large'
        ? 413
        : storageResult.body.code === 'storage_permission_denied'
          ? 403
          : storageResult.body.code === 'upload_timeout'
            ? 408
            : storageResult.body.code === 'auth_required'
              ? 401
              : 500;
    return { ok: false, status, body: storageResult.body };
  }

  onProgress?.({ phase: 'registered' });

  onProgress?.({ phase: 'ocr' });

  const registerResult = await fetchJsonWithRetry<DocumentUploadResult>(
    '/api/documents/upload/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: prepareBody.documentId,
        companyId,
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
        storagePath: prepareBody.storagePath,
        sha256Hash,
      }),
    },
    'register',
    { timeoutMs: API_REQUEST_TIMEOUT_MS },
  );

  if (!registerResult.ok) {
    await removeFailedStorageObject(prepareBody.storagePath);
    const rawBody = registerResult.body as EnrichedDocumentUploadErrorBody;
    const regBody: DocumentUploadErrorBody = {
      ...rawBody,
      step: 'register',
      code: rawBody.code ?? rawBody.error ?? 'register_failed',
      error: rawBody.error ?? rawBody.code ?? 'register_failed',
    };
    const clientAuth = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

    if (regBody.code === 'storage_path_forbidden') {
      const presentation = presentStoragePathForbiddenUploadError({
        httpStatus: registerResult.status,
        body: {
          ...regBody,
          debug: rawBody.debug,
          forbiddenLog: rawBody.forbiddenLog,
        },
        clientSessionUserId: clientAuth.data.user?.id,
        requestCompanyId: companyId,
        requestDocumentId: prepareBody.documentId,
        requestStoragePath: prepareBody.storagePath,
      });
      regBody.message = presentation.message;
      regBody.userHint = presentation.hint;
      regBody.errorReportJson = presentation.reportJson;
      regBody.failureReason = presentation.failureReason;
      console.error('[atlas-documents/client] storage_path_forbidden', {
        companyId,
        documentId: prepareBody.documentId,
        storagePath: prepareBody.storagePath,
        clientSessionUserId: clientAuth.data.user?.id,
        failureReason: presentation.failureReason,
        serverResponse: rawBody,
      });
    } else if (!sanitizeUploadUserMessage(regBody.message)) {
      regBody.message = frenchMessageForRegisterCode(regBody.code ?? 'register_failed', regBody.message);
    }

    logUploadDiagnostic({
      event: 'register_failed_after_storage',
      step: 'register',
      companyId,
      documentId: prepareBody.documentId,
      storagePath: prepareBody.storagePath,
      bucket,
      httpStatus: registerResult.status,
      errorCode: regBody.code,
      errorMessage: regBody.message,
      clientSessionUserId: clientAuth.data.user?.id,
      responseBody: registerResult.body,
    });
    return { ok: false, status: registerResult.status, body: regBody };
  }

  const registerBody = registerResult.data;
  if (!registerBody.document?.id) {
    await removeFailedStorageObject(prepareBody.storagePath);
    return {
      ok: false,
      status: 500,
      body: { error: 'server_error', code: 'server_error', step: 'register', message: 'Erreur serveur.' },
    };
  }

  logUploadDiagnostic({
    event: 'upload_complete',
    step: 'register',
    companyId,
    documentId: registerBody.document.id,
    storagePath: prepareBody.storagePath,
    bucket,
    fileSize: file.size,
    mimeType,
  });

  /* OCR + auto-pipeline run on server via scheduleVercelBackground — client polls progress. */

  return {
    ok: true,
    data: {
      success: registerBody.success ?? true,
      documentId: registerBody.documentId ?? registerBody.document.id,
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
