import { NextResponse } from 'next/server';
import { isMissingTableError } from '@/app/lib/atlas-api-company-guard';

export type ApiErrorBody = {
  ok: false;
  error: string;
  message: string;
};

export type ApiSuccessBody<T> = {
  ok: true;
} & T;

/** Structured JSON error for API routes. */
export function apiError(
  code: string,
  message: string,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ ok: false, error: code, message }, { status });
}

export function apiUnauthorized(message = 'Authentification requise.'): NextResponse<ApiErrorBody> {
  return apiError('auth_required', message, 401);
}

export function apiForbidden(message = 'Accès refusé à cette ressource.'): NextResponse<ApiErrorBody> {
  return apiError('forbidden', message, 403);
}

export function apiNotFound(message = 'Ressource introuvable.'): NextResponse<ApiErrorBody> {
  return apiError('not_found', message, 404);
}

export function apiBadRequest(code: string, message: string): NextResponse<ApiErrorBody> {
  return apiError(code, message, 400);
}

export function apiServerError(message = 'Erreur serveur. Réessayez plus tard.'): NextResponse<ApiErrorBody> {
  return apiError('server_error', message, 500);
}

/** User-facing French messages for common API error codes. */
export function apiErrorMessageFr(code: string, fallback?: string): string {
  switch (code) {
    case 'auth_required':
      return 'Connectez-vous pour continuer.';
    case 'company_id_required':
      return 'Sélectionnez une société active.';
    case 'company_not_found_or_forbidden':
      return 'Cette société est introuvable ou ne vous appartient pas.';
    case 'forbidden':
      return 'Accès refusé à cette ressource.';
    case 'not_found':
      return 'Ressource introuvable.';
    case 'table_missing':
      return 'Module en cours de déploiement — réessayez après migration base de données.';
    case 'invalid_action':
      return 'Action non reconnue.';
    case 'missing_fields':
      return 'Champs obligatoires manquants.';
    default:
      return fallback ?? 'Une erreur est survenue. Réessayez.';
  }
}

/** Map PostgREST errors — missing tables return empty ok payload instead of 500. */
export function mapDbError(
  error: { message: string },
  emptyPayload: Record<string, unknown> = {},
): NextResponse {
  if (isMissingTableError(error.message)) {
    return NextResponse.json({ ok: true, ...emptyPayload, warning: apiErrorMessageFr('table_missing') });
  }
  return apiServerError(error.message);
}

/** Client-side: parse fetch response without throwing. */
export async function parseApiJson<T extends Record<string, unknown>>(
  res: Response,
): Promise<{ ok: boolean; data: T; status: number }> {
  const status = res.status;
  try {
    const data = (await res.json()) as T;
    const ok = res.ok && (data as { ok?: boolean }).ok !== false;
    return { ok, data, status };
  } catch {
    return {
      ok: false,
      data: { error: 'invalid_json', message: 'Réponse serveur invalide.' } as unknown as T,
      status,
    };
  }
}
