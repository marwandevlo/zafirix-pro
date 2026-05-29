/**
 * Supabase Storage helpers for Documents IA (Sprint D-alt).
 * Path layout: {userId}/{companyId}/{documentId}/{safeFilename}
 */

export const ATLAS_DOCUMENTS_BUCKET = 'atlas-documents';

export const ATLAS_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const ATLAS_DOCUMENT_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

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
