import type { AtlasOcrError, AtlasOcrExtraction } from '@/app/types/atlas-document';
import { normalizeOcrAiResponse, type NormalizedOcrPayload } from '@/app/lib/atlas-ocr-normalize';

export const OCR_PROVIDER = 'anthropic';

export type OcrAiErrorBody = {
  error?: string;
  code?: string;
  step?: string;
  message?: string;
  provider?: string;
};

export function isPdfMimeType(mime: string): boolean {
  return mime.toLowerCase() === 'application/pdf';
}

export function isOcrSupportedImageMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return m === 'image/jpeg' || m === 'image/png' || m === 'image/webp' || m === 'image/gif';
}

export function anthropicImageMediaType(
  mime: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/png') return 'image/png';
  if (m === 'image/gif') return 'image/gif';
  if (m === 'image/webp') return 'image/webp';
  return null;
}

/** Strip markdown fences / "json" prefix and parse OCR JSON from model output. */
export function parseOcrJsonResponse(raw: string): AtlasOcrExtraction {
  const normalized = normalizeOcrAiResponse(raw);
  if (normalized.type === 'bank_statement') {
    return {
      description: [
        normalized.bankName,
        normalized.period,
        normalized.transactions.length ? `${normalized.transactions.length} opération(s)` : '',
      ].filter(Boolean).join(' · '),
    };
  }
  const { type: _type, ...invoice } = normalized;
  return invoice as AtlasOcrExtraction;
}

/** Parse OCR AI text and return a typed payload for the client. */
export function parseOcrClientPayload(raw: string): NormalizedOcrPayload {
  return normalizeOcrAiResponse(raw);
}

export function formatOcrUiMessage(code: string, fallbackMessage?: string): string {
  switch (code) {
    case 'ocr_not_configured':
    case 'server_not_configured':
      return 'OCR غير مفعل: خاص API key';
    case 'pdf_not_supported':
      return 'PDF OCR غير مدعوم حالياً، جرّب صورة JPG/PNG';
    case 'pdf_render_failed':
      return 'Impossible de convertir le PDF (page 1). Essayez une image JPG/PNG.';
    case 'image_too_large':
      return 'Image OCR trop volumineuse après conversion PDF. Essayez un PDF plus léger ou une photo JPG/PNG.';
    case 'ocr_timeout':
      return 'Analyse OCR interrompue (délai dépassé). Réessayez avec un PDF plus court.';
    case 'mime_not_supported':
      return 'Type de fichier non pris en charge pour l’OCR (JPG/PNG/WebP/GIF).';
    case 'json_parse_failed':
      return 'Extraction OCR invalide. Réessayez avec un autre fichier.';
    case 'ai_provider_error':
      return fallbackMessage || 'Échec du fournisseur OCR. Réessayez.';
    case 'auth_required':
    case 'missing_token':
      return 'Connectez-vous pour utiliser l’OCR.';
    case 'invalid_token':
      return 'Session expirée. Reconnectez-vous.';
    default:
      return fallbackMessage || 'Échec de l’analyse OCR. Le fichier a été enregistré.';
  }
}

export function formatOcrDevDiagnostics(input: {
  documentId: string;
  mimeType: string;
  fileSize: number;
  step: string;
  code?: string;
  message?: string;
  provider?: string;
  httpStatus?: number;
}): string {
  if (process.env.NODE_ENV !== 'development') return formatOcrUiMessage(input.code ?? 'ocr_failed', input.message);

  return [
    formatOcrUiMessage(input.code ?? 'ocr_failed', input.message),
    `step=${input.step}`,
    input.code ? `code=${input.code}` : '',
    input.message ? `message=${input.message}` : '',
    `doc=${input.documentId}`,
    `mime=${input.mimeType}`,
    `size=${input.fileSize}`,
    `provider=${input.provider ?? OCR_PROVIDER}`,
    input.httpStatus != null ? `http=${input.httpStatus}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ocrErrorFromAiBody(body: OcrAiErrorBody, step = 'ai_provider'): AtlasOcrError {
  return {
    step: body.step ?? step,
    code: body.code ?? body.error ?? 'ai_provider_error',
    message: body.message ?? body.error ?? 'OCR request failed',
  };
}
