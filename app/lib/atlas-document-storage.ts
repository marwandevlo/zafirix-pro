/**
 * Supabase Storage helpers for Documents IA (Sprint D-alt).
 * Path layout: {userId}/{companyId}/{documentId}/{safeFilename}
 * Working copy: {userId}/{companyId}/{documentId}/working/ocr-ready.jpg
 */

export const ATLAS_DOCUMENTS_BUCKET = 'atlas-documents';

/** PDF uploads (accounting scans, multi-page). */
export const ATLAS_DOCUMENT_MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

/** Single image uploads. */
export const ATLAS_DOCUMENT_MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Upper bound for proxy / validation (PDF limit). */
export const ATLAS_DOCUMENT_MAX_BYTES = ATLAS_DOCUMENT_MAX_PDF_BYTES;

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

export function sanitizeDocumentFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document';
  const cleaned = base.replace(/[^\w.\-() ]+/g, '_').trim();
  return cleaned.slice(0, 180) || 'document';
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
