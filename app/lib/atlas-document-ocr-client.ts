/**
 * Start server-side OCR on Vercel (must be a real HTTP request — not fire-and-forget in register).
 */

import { logUploadDiagnostic } from '@/app/lib/atlas-document-upload-diagnostics';
import { isPdfMimeType } from '@/app/lib/atlas-document-storage';

/** Runs OCR to completion on the server (async=0, maxDuration on /ocr routes). */
export function triggerDocumentOcrJob(documentId: string, mimeType: string): void {
  const isPdf = isPdfMimeType(mimeType);
  const url = isPdf
    ? `/api/documents/${encodeURIComponent(documentId)}/ocr?async=0`
    : `/api/documents/${encodeURIComponent(documentId)}/ocr-image?async=0`;

  logUploadDiagnostic({
    event: 'ocr_trigger_start',
    step: 'ocr_start',
    documentId,
    mimeType,
  });

  void fetch(url, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string; message?: string };
      if (!res.ok) {
        logUploadDiagnostic({
          event: 'ocr_trigger_failed',
          step: 'ocr_start',
          documentId,
          mimeType,
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
        mimeType,
        httpStatus: res.status,
      });
    })
    .catch((err) => {
      logUploadDiagnostic({
        event: 'ocr_trigger_network_error',
        step: 'ocr_start',
        documentId,
        mimeType,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    });
}
