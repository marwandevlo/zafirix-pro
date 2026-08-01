/**
 * User-facing messages and copyable diagnostics for document upload register failures.
 */

import { frenchMessageForRegisterCode } from '@/app/lib/atlas-document-register-errors';
import type { RegisterPathForbiddenLogPayload } from '@/app/lib/atlas-document-storage-path-debug';

export type StoragePathForbiddenDebugPayload = {
  trigger?: string;
  reason?: string;
  sessionUserId?: string;
  bodyCompanyId?: string;
  bodyDocumentId?: string;
  storagePathRaw?: string;
  storagePathNormalized?: string;
  parsedPathUserId?: string | null;
  parsedPathCompanyId?: string | null;
  parsedPathDocumentId?: string | null;
  userRole?: string | null;
  companyOwned?: boolean;
  workspaceId?: string | null;
  segmentCount?: number;
  extra?: Record<string, unknown>;
};

export type DocumentUploadErrorPresentation = {
  message: string;
  hint?: string;
  reportJson?: string;
  failureReason?: string;
};

export type EnrichedDocumentUploadErrorBody = {
  error?: string;
  code?: string;
  step?: string;
  message?: string;
  debug?: StoragePathForbiddenDebugPayload;
  forbiddenLog?: RegisterPathForbiddenLogPayload;
  userHint?: string;
  errorReportJson?: string;
  failureReason?: string;
};

function resolveFailureReason(
  debug?: StoragePathForbiddenDebugPayload,
  forbiddenLog?: RegisterPathForbiddenLogPayload,
): string | undefined {
  return forbiddenLog?.failureReason ?? debug?.reason ?? undefined;
}

/** Plain-language guidance for non-technical users. */
export function storagePathForbiddenUserHint(
  reason: string | undefined,
  ctx?: {
    pathUserMatchesSession?: boolean;
    canAccessCompanySessionUser?: boolean | null;
    clientSessionUserId?: string | null;
    parsedPathUserId?: string | null;
  },
): string {
  switch (reason) {
    case 'user_id_mismatch':
      if (ctx?.clientSessionUserId && ctx?.parsedPathUserId && ctx.clientSessionUserId !== ctx.parsedPathUserId) {
        return (
          'Votre session de connexion ne correspond pas au dossier de téléversement. ' +
          'Cela arrive souvent après un changement de société ou une connexion sur plusieurs onglets. ' +
          'Rechargez la page (F5), vérifiez la société active en haut à gauche, puis réessayez.'
        );
      }
      return (
        'Votre compte n’est pas reconnu comme propriétaire du chemin de stockage. ' +
        'Rechargez la page, reconnectez-vous si besoin, puis réessayez avec la bonne société active.'
      );
    case 'document_id_mismatch':
      return (
        'Les identifiants du document ne correspondent pas. Rechargez la page et téléversez le fichier à nouveau ' +
        'sans interrompre l’envoi.'
      );
    case 'parse_failed':
      return (
        'Le chemin de stockage est illisible pour le serveur. Rechargez complètement la page (Ctrl+F5 ou Cmd+Shift+R) ' +
        'puis réessayez.'
      );
    case 'company_id_missing':
      return 'Aucune société active n’a été associée au fichier. Sélectionnez une société, rechargez la page, puis réessayez.';
    default:
      return (
        'Rechargez la page, vérifiez la société sélectionnée, puis réessayez. ' +
        'Si le problème continue, copiez le rapport d’erreur ci-dessous et envoyez-le au support.'
      );
  }
}

export function buildStoragePathForbiddenErrorReport(input: {
  httpStatus: number;
  code: string;
  step?: string;
  message?: string;
  failureReason?: string;
  debug?: StoragePathForbiddenDebugPayload;
  forbiddenLog?: RegisterPathForbiddenLogPayload;
  clientContext?: {
    clientSessionUserId?: string | null;
    requestCompanyId?: string;
    requestDocumentId?: string;
    requestStoragePath?: string;
    appBuildId?: string;
  };
}): string {
  const report = {
    event: 'storage_path_forbidden_user_report',
    ts: new Date().toISOString(),
    httpStatus: input.httpStatus,
    code: input.code,
    step: input.step ?? 'register',
    message: input.message,
    failureReason: input.failureReason,
    debug: input.debug ?? null,
    forbiddenLog: input.forbiddenLog ?? null,
    client: input.clientContext ?? null,
  };
  return JSON.stringify(report, null, 2);
}

export function presentStoragePathForbiddenUploadError(input: {
  httpStatus: number;
  body: EnrichedDocumentUploadErrorBody;
  clientSessionUserId?: string | null;
  requestCompanyId?: string;
  requestDocumentId?: string;
  requestStoragePath?: string;
}): DocumentUploadErrorPresentation {
  const debug = input.body.debug;
  const forbiddenLog = input.body.forbiddenLog;
  const failureReason = resolveFailureReason(debug, forbiddenLog);
  const message = frenchMessageForRegisterCode('storage_path_forbidden', input.body.message);

  const hint = storagePathForbiddenUserHint(failureReason, {
    clientSessionUserId: input.clientSessionUserId,
    parsedPathUserId: forbiddenLog?.parsedPathUserId ?? debug?.parsedPathUserId ?? null,
    pathUserMatchesSession: forbiddenLog?.pathUserMatchesSession,
    canAccessCompanySessionUser: forbiddenLog?.canAccessCompanySessionUser,
  });

  const reportJson = buildStoragePathForbiddenErrorReport({
    httpStatus: input.httpStatus,
    code: 'storage_path_forbidden',
    step: input.body.step,
    message: input.body.message,
    failureReason,
    debug,
    forbiddenLog,
    clientContext: {
      clientSessionUserId: input.clientSessionUserId,
      requestCompanyId: input.requestCompanyId,
      requestDocumentId: input.requestDocumentId,
      requestStoragePath: input.requestStoragePath,
      appBuildId:
        typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_BUILD_ID : undefined,
    },
  });

  return { message, hint, reportJson, failureReason };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }

  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
