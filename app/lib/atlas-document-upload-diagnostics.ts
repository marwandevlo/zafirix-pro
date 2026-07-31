/**
 * Client-side upload diagnostics (Vercel logs via API + browser console).
 */

export type UploadDiagnosticPayload = {
  event: string;
  step?: string;
  companyId?: string;
  documentId?: string;
  storagePath?: string;
  bucket?: string;
  fileSize?: number;
  mimeType?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  attempt?: number;
  clientSessionUserId?: string;
  responseBody?: unknown;
};

export function logUploadDiagnostic(payload: UploadDiagnosticPayload): void {
  const line = {
    ts: new Date().toISOString(),
    scope: 'documents/upload/client',
    ...payload,
  };

  try {
    console.info(JSON.stringify(line));
  } catch {
    /* noop */
  }

  if (typeof window === 'undefined') return;

  void fetch('/api/documents/upload/diagnostic', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(line),
  }).catch(() => {});
}
