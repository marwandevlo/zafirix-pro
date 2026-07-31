/**
 * Supabase Storage helpers for Documents IA (Sprint D-alt).
 * Path layout: {userId}/{companyId}/{documentId}/{safeFilename}
 * Legacy layout (still accepted): {userId}/{documentId}/{safeFilename}
 * Working copy: {userId}/{companyId}/{documentId}/working/ocr-ready.jpg
 */

export const ATLAS_DOCUMENTS_BUCKET = 'atlas-documents';

/**
 * Production upload limits (conservative until Supabase/queue OCR worker for large files).
 * Bucket may allow 50 MB; app rejects above these limits before Storage upload.
 */
export const ATLAS_DOCUMENT_MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/** Single image uploads — compress client-side if larger. */
export const ATLAS_DOCUMENT_MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

/** Future bucket / worker target (not enforced in app yet). */
export const ATLAS_DOCUMENT_FUTURE_MAX_PDF_BYTES = 50 * 1024 * 1024;

/** Upper bound for proxy / validation (PDF limit). */
export const ATLAS_DOCUMENT_MAX_BYTES = ATLAS_DOCUMENT_MAX_PDF_BYTES;

/** Shown when file exceeds stabilized limits (large-file path deferred to worker). */
export const LARGE_FILE_STABILIZATION_MESSAGE_FR =
  'Pour les gros fichiers, compressez le document avant téléversement. Le support 50 Mo est en cours de stabilisation.';

export const ATLAS_DOCUMENT_MAX_FILES_PER_BATCH = 10;

export const ATLAS_DOCUMENT_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export function isPdfMimeType(mime: string): boolean {
  const m = mime.toLowerCase();
  return m === 'application/pdf' || m.endsWith('/pdf');
}

export function maxUploadBytesForMime(mime: string): number {
  return isPdfMimeType(mime) ? ATLAS_DOCUMENT_MAX_PDF_BYTES : ATLAS_DOCUMENT_MAX_IMAGE_BYTES;
}

export function formatMaxUploadLabel(mime: string): string {
  const mb = Math.round(maxUploadBytesForMime(mime) / (1024 * 1024));
  return `${mb} Mo`;
}

export function documentUploadLimitExceededMessage(mime: string): string {
  return `${LARGE_FILE_STABILIZATION_MESSAGE_FR} (max actuel : ${formatMaxUploadLabel(mime)}).`;
}

export function sanitizeDocumentFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document';
  const cleaned = base.replace(/[^\w.\-() ]+/g, '_').trim();
  return cleaned.slice(0, 180) || 'document';
}

export type ParsedAtlasDocumentStoragePath = {
  userId: string;
  companyId: string | null;
  documentId: string;
  filename: string;
};

export type StoragePathValidationExpected = {
  userId: string;
  companyId?: string | null;
  documentId?: string;
};

export type StoragePathValidationFailure = {
  ok: false;
  code: 'storage_path_forbidden';
  reason: 'parse_failed' | 'user_id_mismatch' | 'document_id_mismatch';
  expected: StoragePathValidationExpected;
  received: {
    storagePath: string;
    normalizedPath: string;
    parsed: ParsedAtlasDocumentStoragePath | null;
  };
};

export type StoragePathValidationSuccess = {
  ok: true;
  parsed: ParsedAtlasDocumentStoragePath;
  normalizedPath: string;
};

export type StoragePathValidationResult = StoragePathValidationSuccess | StoragePathValidationFailure;

function normalizeIdSegment(value: string): string {
  return value.trim().toLowerCase();
}

function idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeIdSegment(a) === normalizeIdSegment(b);
}

/** Strip bucket prefix, slashes, and normalize separators before parsing. */
export function normalizeAtlasDocumentStoragePath(storagePath: string): string {
  let normalized = storagePath.replace(/\\/g, '/').trim();
  normalized = normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalized.startsWith(`${ATLAS_DOCUMENTS_BUCKET}/`)) {
    normalized = normalized.slice(`${ATLAS_DOCUMENTS_BUCKET}/`.length);
  }
  return normalized;
}

/**
 * Parse `{userId}/{companyId}/{documentId}/{filename}` or legacy `{userId}/{documentId}/{filename}`.
 * UUID segments are normalized to lowercase.
 */
export function parseAtlasDocumentStoragePath(storagePath: string): ParsedAtlasDocumentStoragePath | null {
  const normalized = normalizeAtlasDocumentStoragePath(storagePath);
  if (!normalized || normalized.includes('..')) return null;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 3 || segments.some((segment) => !segment.trim())) return null;

  if (segments.length >= 4) {
    const [userId, companyId, documentId, ...rest] = segments;
    const filename = rest.join('/');
    if (!userId || !companyId || !documentId || !filename) return null;
    return {
      userId: normalizeIdSegment(userId),
      companyId: normalizeIdSegment(companyId),
      documentId: normalizeIdSegment(documentId),
      filename,
    };
  }

  const [userId, documentId, ...rest] = segments;
  const filename = rest.join('/');
  if (!userId || !documentId || !filename) return null;

  return {
    userId: normalizeIdSegment(userId),
    companyId: null,
    documentId: normalizeIdSegment(documentId),
    filename,
  };
}

/**
 * Validate a storage path for the current uploader.
 * Company id in the path is authoritative for workspace scoping; body companyId mismatches do not fail here.
 */
export function validateAtlasDocumentStoragePath(
  storagePath: string,
  expected: StoragePathValidationExpected,
): StoragePathValidationResult {
  const normalizedPath = normalizeAtlasDocumentStoragePath(storagePath);
  const parsed = parseAtlasDocumentStoragePath(storagePath);
  const baseReceived = { storagePath, normalizedPath, parsed };

  if (!parsed) {
    return {
      ok: false,
      code: 'storage_path_forbidden',
      reason: 'parse_failed',
      expected,
      received: baseReceived,
    };
  }

  if (!idsEqual(parsed.userId, expected.userId)) {
    return {
      ok: false,
      code: 'storage_path_forbidden',
      reason: 'user_id_mismatch',
      expected,
      received: baseReceived,
    };
  }

  if (expected.documentId && !idsEqual(parsed.documentId, expected.documentId)) {
    return {
      ok: false,
      code: 'storage_path_forbidden',
      reason: 'document_id_mismatch',
      expected,
      received: baseReceived,
    };
  }

  return { ok: true, parsed, normalizedPath };
}

/** Temporary diagnostic logging when path validation fails. */
export function logStoragePathValidationFailure(failure: StoragePathValidationFailure): void {
  console.error('[atlas-documents] storage_path_forbidden', {
    reason: failure.reason,
    expected: failure.expected,
    received: failure.received,
  });
}

export function buildAtlasDocumentStoragePath(
  userId: string,
  companyId: string,
  documentId: string,
  filename: string,
): string {
  return `${normalizeIdSegment(userId)}/${normalizeIdSegment(companyId)}/${normalizeIdSegment(documentId)}/${sanitizeDocumentFilename(filename)}`;
}

export function buildAtlasDocumentWorkingStoragePath(
  userId: string,
  companyId: string,
  documentId: string,
): string {
  return `${normalizeIdSegment(userId)}/${normalizeIdSegment(companyId)}/${normalizeIdSegment(documentId)}/working/ocr-ready.jpg`;
}

/** RLS requires the uploading user's id as the first path segment (case-insensitive). */
export function storagePathOwnedByUser(storagePath: string, userId: string): boolean {
  const parsed = parseAtlasDocumentStoragePath(storagePath);
  if (!parsed) return false;
  return idsEqual(parsed.userId, userId);
}

export function isAllowedDocumentMime(mime: string): boolean {
  if (!mime) return false;
  return ATLAS_DOCUMENT_ALLOWED_MIME.has(mime.toLowerCase());
}

/** Browser File.type is often empty for PDF/images on Windows — infer from extension. */
export function inferDocumentMimeType(file: Pick<File, 'name' | 'type'>): string {
  const declared = (file.type ?? '').trim().toLowerCase();
  if (declared) return declared;

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return byExt[ext] ?? '';
}
