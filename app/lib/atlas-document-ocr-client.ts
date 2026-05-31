/**
 * Start server-side OCR on Vercel (HTTP 202 + waitUntil on server).
 */

import { logUploadDiagnostic } from '@/app/lib/atlas-document-upload-diagnostics';

/** POST /api/documents/[id]/ocr/run — server runs OCR after response (Vercel-safe). */
export function triggerDocumentOcrJob(documentId: string, _mimeType?: string): void {
  const url = `/api/documents/${encodeURIComponent(documentId)}/ocr/run`;

  logUploadDiagnostic({
    event: 'ocr_trigger_start',
    step: 'ocr_start',
    documentId,
  });

  void fetch(url, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        logUploadDiagnostic({
          event: 'ocr_trigger_failed',
          step: 'ocr_start',
          documentId,
          httpStatus: res.status,
          errorCode: body.code ?? body.error,
          errorMessage: body.message ?? body.error,
          responseBody: body,
        });
        return;
      }
      logUploadDiagnostic({
        event: 'ocr_trigger_complete',
        step: 'ocr_start',
        documentId,
        httpStatus: res.status,
      });
    })
    .catch((err) => {
      logUploadDiagnostic({
        event: 'ocr_trigger_network_error',
        step: 'ocr_start',
        documentId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    });
}
