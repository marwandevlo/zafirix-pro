/**
 * Temporary deep diagnostics for storage_path_forbidden during document upload/register.
 */

import type { CompanyRoleContext } from '@/app/lib/atlas-permissions';
import {
  normalizeAtlasDocumentStoragePath,
  parseAtlasDocumentStoragePath,
  type StoragePathValidationFailure,
} from '@/app/lib/atlas-document-storage';

export type StoragePathForbiddenTrigger =
  | 'register_path_ownership'
  | 'register_path_validate'
  | 'register_storage_verify_parse'
  | 'register_storage_verify_list';

export type StoragePathForbiddenDiagnostic = {
  trigger: StoragePathForbiddenTrigger;
  reason: string;
  sessionUserId: string;
  bodyCompanyId?: string;
  bodyDocumentId?: string;
  storagePathRaw: string;
  storagePathNormalized: string;
  parsedPathUserId: string | null;
  parsedPathCompanyId: string | null;
  parsedPathDocumentId: string | null;
  parsedFilename: string | null;
  userRole: string | null;
  companyOwned: boolean;
  workspaceId: string | null;
  segmentCount: number;
  extra?: Record<string, unknown>;
};

export function buildStoragePathForbiddenDiagnostic(input: {
  trigger: StoragePathForbiddenTrigger;
  reason: string;
  sessionUserId: string;
  storagePath: string;
  companyId?: string;
  documentId?: string;
  roleContext?: CompanyRoleContext;
  extra?: Record<string, unknown>;
}): StoragePathForbiddenDiagnostic {
  const storagePathNormalized = normalizeAtlasDocumentStoragePath(input.storagePath);
  const parsed = parseAtlasDocumentStoragePath(input.storagePath);
  const segments = storagePathNormalized.split('/').filter(Boolean);

  return {
    trigger: input.trigger,
    reason: input.reason,
    sessionUserId: input.sessionUserId,
    bodyCompanyId: input.companyId,
    bodyDocumentId: input.documentId,
    storagePathRaw: input.storagePath,
    storagePathNormalized,
    parsedPathUserId: parsed?.userId ?? null,
    parsedPathCompanyId: parsed?.companyId ?? null,
    parsedPathDocumentId: parsed?.documentId ?? null,
    parsedFilename: parsed?.filename ?? null,
    userRole: input.roleContext?.role ?? null,
    companyOwned: input.roleContext?.owned ?? false,
    workspaceId: input.roleContext?.workspaceId ?? null,
    segmentCount: segments.length,
    extra: input.extra,
  };
}

/** Server-side console.error with full expected vs received context. */
export function logStoragePathForbiddenDiagnostic(diag: StoragePathForbiddenDiagnostic): void {
  console.error('[atlas-documents] storage_path_forbidden DIAGNOSTIC', diag);
}

export function logStoragePathValidationFailureDetailed(
  failure: StoragePathValidationFailure,
  diag: StoragePathForbiddenDiagnostic,
): void {
  console.error('[atlas-documents] storage_path_forbidden VALIDATION', {
    reason: failure.reason,
    expected: failure.expected,
    received: failure.received,
    diagnostic: diag,
  });
}
