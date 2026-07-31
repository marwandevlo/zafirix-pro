/**
 * Supabase Storage helpers for Documents IA (Sprint D-alt).
 * Path layout: {userId}/{companyId}/{documentId}/{safeFilename}
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
  companyId: string;
  documentId: string;
  filename: string;
};

/** Parse `{userId}/{companyId}/{documentId}/{filename}` storage keys. */
export function parseAtlasDocumentStoragePath(storagePath: string): ParsedAtlasDocumentStoragePath | null {
  const normalized = storagePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('..')) return null;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 4) return null;

  const [userId, companyId, documentId, ...rest] = segments;
  const filename = rest.join('/');
  if (!userId || !companyId || !documentId || !filename) return null;

  return { userId, companyId, documentId, filename };
}

export function validateAtlasDocumentStoragePath(
  storagePath: string,
  expected: { userId: string; companyId?: string; documentId?: string },
): { ok: true; parsed: ParsedAtlasDocumentStoragePath } | { ok: false; code: 'storage_path_forbidden' } {
  const parsed = parseAtlasDocumentStoragePath(storagePath);
  if (!parsed) return { ok: false, code: 'storage_path_forbidden' };
  if (parsed.userId !== expected.userId) return { ok: false, code: 'storage_path_forbidden' };
  if (expected.companyId && parsed.companyId !== expected.companyId) {
    return { ok: false, code: 'storage_path_forbidden' };
  }
  if (expected.documentId && parsed.documentId !== expected.documentId) {
    return { ok: false, code: 'storage_path_forbidden' };
  }
  return { ok: true, parsed };
}

export function buildAtlasDocumentStoragePath(
  userId: string,
  companyId: string,
  documentId: string,
  filename: string,
): string {
  return `${userId}/${companyId}/${documentId}/${sanitizeDocumentFilename(filename)}`;
}

export function buildAtlasDocumentWorkingStoragePath(
  userId: string,
  companyId: string,
  documentId: string,
): string {
  return `${userId}/${companyId}/${documentId}/working/ocr-ready.jpg`;
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
