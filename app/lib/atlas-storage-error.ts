/**
 * Parse Supabase Storage errors into stable codes + French user messages.
 */

export type ParsedStorageError = {
  code: string;
  message: string;
  statusCode?: number;
  raw?: string;
};

function tryParseJsonMessage(text: string): { error?: string; message?: string; statusCode?: number } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as { error?: string; message?: string; statusCode?: number };
  } catch {
    return null;
  }
}

export function parseSupabaseStorageError(err: unknown): ParsedStorageError {
  const fallback: ParsedStorageError = {
    code: 'storage_upload_failed',
    message: 'Échec du téléversement vers le stockage.',
    raw: String(err),
  };

  if (!err || typeof err !== 'object') {
    return fallback;
  }

  const e = err as {
    name?: string;
    message?: string;
    error?: string;
    statusCode?: number | string;
    status?: number;
  };

  let message = (e.message ?? e.error ?? '').trim();
  const statusCode = Number(e.statusCode ?? e.status ?? 0) || undefined;

  if (!message || message === 'StorageApiError' || message === e.name) {
    const fromJson = message ? tryParseJsonMessage(message) : null;
    if (fromJson?.message) message = fromJson.message;
    else if (fromJson?.error) message = fromJson.error;
    else if (e.name === 'StorageApiError' || e.name === 'StorageError') {
      return {
        code: 'storage_permission_denied',
        message: 'Autorisation stockage refusée. Reconnectez-vous puis réessayez.',
        statusCode: 403,
        raw: e.name,
      };
    }
  }

  if (message) {
    const nested = tryParseJsonMessage(message);
    if (nested?.message) message = nested.message;
    else if (nested?.error) message = nested.error;
  }

  const haystack = `${message} ${e.name ?? ''}`.toLowerCase();

  if (
    statusCode === 413 ||
    /payload too large|exceeded.*maximum|file_size_limit|too large|entity too large/i.test(haystack)
  ) {
    return {
      code: 'file_too_large',
      message: 'Fichier trop volumineux pour le bucket Supabase (vérifiez la limite 50 Mo).',
      statusCode: 413,
      raw: message || e.name,
    };
  }

  if (
    statusCode === 403 ||
    /policy|permission|denied|unauthorized|row-level security|not allowed|invalid jwt/i.test(haystack)
  ) {
    return {
      code: 'storage_permission_denied',
      message: 'Autorisation stockage refusée. Reconnectez-vous puis réessayez.',
      statusCode: 403,
      raw: message || e.name,
    };
  }

  if (/mime|content-type|invalid file type|allowed_mime/i.test(haystack)) {
    return {
      code: 'mime_not_allowed',
      message: 'Type de fichier refusé par le bucket (images ou PDF uniquement).',
      statusCode,
      raw: message,
    };
  }

  if (/already exists|duplicate|409/i.test(haystack)) {
    return {
      code: 'storage_duplicate',
      message: 'Ce fichier existe déjà dans le stockage. Réessayez.',
      statusCode: 409,
      raw: message,
    };
  }

  if (/timeout|timed out/i.test(haystack)) {
    return {
      code: 'upload_timeout',
      message: 'Délai dépassé pendant le téléversement.',
      statusCode,
      raw: message,
    };
  }

  if (statusCode === 401) {
    return {
      code: 'auth_required',
      message: 'Session expirée. Reconnectez-vous.',
      statusCode: 401,
      raw: message,
    };
  }

  if (statusCode && statusCode >= 500) {
    return {
      code: 'server_error',
      message: 'Erreur serveur. Réessayez dans quelques instants.',
      statusCode,
      raw: message,
    };
  }

  if (message && message !== 'StorageApiError' && !/^Storage\w*Error$/i.test(message)) {
    return {
      code: 'storage_upload_failed',
      message: `Échec du stockage : ${message}`,
      statusCode,
      raw: message,
    };
  }

  return {
    code: 'storage_permission_denied',
    message: 'Autorisation stockage refusée. Reconnectez-vous puis réessayez.',
    statusCode: 403,
    raw: e.name ?? 'StorageApiError',
  };
}

export function formatStorageErrorForUi(parsed: ParsedStorageError): string {
  return parsed.message;
}
