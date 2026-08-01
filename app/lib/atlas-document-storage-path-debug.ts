/**
 * Remote-user diagnostics for storage_path_forbidden during document upload/register.
 * Emits console.error + structured server logs readable in Vercel.
 */

import type { CompanyRoleContext } from '@/app/lib/atlas-permissions';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import {
  normalizeAtlasDocumentStoragePath,
  parseAtlasDocumentStoragePath,
  type ParsedAtlasDocumentStoragePath,
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

/** Full request + permission snapshot for Vercel log search. */
export type RegisterPathForbiddenLogPayload = {
  layer: 'register_core' | 'api_route';
  step: string;
  trigger: StoragePathForbiddenTrigger;
  failureReason: string;
  sessionUserId: string;
  bodyCompanyId: string;
  bodyDocumentId: string;
  bodyFilename: string;
  bodyMimeType: string;
  bodySizeBytes: number;
  bodySha256Hash: string | null;
  storagePathRaw: string;
  storagePathNormalized: string;
  effectiveCompanyId: string | null;
  parsedPathUserId: string | null;
  parsedPathCompanyId: string | null;
  parsedPathDocumentId: string | null;
  parsedFilename: string | null;
  pathSegmentCount: number;
  pathUserMatchesSession: boolean;
  allowWorkspaceCompanyPath: boolean;
  companyInPathMatches: boolean | null;
  canAccessCompanySessionUser: boolean | null;
  canAccessCompanyPathUser: boolean | null;
  canAccessCompanyBodyCompany: boolean | null;
  sessionUserRole: string | null;
  sessionUserCompanyOwned: boolean;
  sessionUserWorkspaceId: string | null;
  pathUserRole: string | null;
  pathUserCompanyOwned: boolean | null;
  pathUserWorkspaceId: string | null;
  validationExpected: StoragePathValidationFailure['expected'] | null;
  validationReceived: StoragePathValidationFailure['received'] | null;
  extra?: Record<string, unknown>;
};

export type RegisterStoredDocumentRequestSnapshot = {
  sessionUserId: string;
  bodyCompanyId: string;
  bodyDocumentId: string;
  storagePathRaw: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash?: string;
};

export type RegisterPathPermissionSnapshot = {
  effectiveCompanyId: string | null;
  pathUserMatchesSession: boolean;
  allowWorkspaceCompanyPath: boolean;
  companyInPathMatches: boolean | null;
  canAccessCompanySessionUser: boolean | null;
  canAccessCompanyPathUser: boolean | null;
  canAccessCompanyBodyCompany: boolean | null;
  sessionRole: CompanyRoleContext;
  pathUserRole?: CompanyRoleContext | null;
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

export function buildRegisterPathForbiddenLogPayload(input: {
  layer: RegisterPathForbiddenLogPayload['layer'];
  step: string;
  trigger: StoragePathForbiddenTrigger;
  failureReason: string;
  request: RegisterStoredDocumentRequestSnapshot;
  parsed: ParsedAtlasDocumentStoragePath | null;
  permissions: RegisterPathPermissionSnapshot;
  validation?: StoragePathValidationFailure | null;
  extra?: Record<string, unknown>;
}): RegisterPathForbiddenLogPayload {
  const normalized = normalizeAtlasDocumentStoragePath(input.request.storagePathRaw);
  const segments = normalized.split('/').filter(Boolean);

  return {
    layer: input.layer,
    step: input.step,
    trigger: input.trigger,
    failureReason: input.failureReason,
    sessionUserId: input.request.sessionUserId,
    bodyCompanyId: input.request.bodyCompanyId,
    bodyDocumentId: input.request.bodyDocumentId,
    bodyFilename: input.request.filename,
    bodyMimeType: input.request.mimeType,
    bodySizeBytes: input.request.sizeBytes,
    bodySha256Hash: input.request.sha256Hash ?? null,
    storagePathRaw: input.request.storagePathRaw,
    storagePathNormalized: normalized,
    effectiveCompanyId: input.permissions.effectiveCompanyId,
    parsedPathUserId: input.parsed?.userId ?? null,
    parsedPathCompanyId: input.parsed?.companyId ?? null,
    parsedPathDocumentId: input.parsed?.documentId ?? null,
    parsedFilename: input.parsed?.filename ?? null,
    pathSegmentCount: segments.length,
    pathUserMatchesSession: input.permissions.pathUserMatchesSession,
    allowWorkspaceCompanyPath: input.permissions.allowWorkspaceCompanyPath,
    companyInPathMatches: input.permissions.companyInPathMatches,
    canAccessCompanySessionUser: input.permissions.canAccessCompanySessionUser,
    canAccessCompanyPathUser: input.permissions.canAccessCompanyPathUser,
    canAccessCompanyBodyCompany: input.permissions.canAccessCompanyBodyCompany,
    sessionUserRole: input.permissions.sessionRole.role,
    sessionUserCompanyOwned: input.permissions.sessionRole.owned,
    sessionUserWorkspaceId: input.permissions.sessionRole.workspaceId,
    pathUserRole: input.permissions.pathUserRole?.role ?? null,
    pathUserCompanyOwned: input.permissions.pathUserRole?.owned ?? null,
    pathUserWorkspaceId: input.permissions.pathUserRole?.workspaceId ?? null,
    validationExpected: input.validation?.expected ?? null,
    validationReceived: input.validation?.received ?? null,
    extra: input.extra,
  };
}

/** Force visible Vercel log line with every request/permission field. */
export function logRegisterStoragePathForbidden(payload: RegisterPathForbiddenLogPayload): void {
  console.error(
    '[atlas-documents] storage_path_forbidden FULL',
    JSON.stringify({ event: 'storage_path_forbidden', ts: new Date().toISOString(), ...payload }),
  );
  logAtlasServerEvent('documents/upload/register', 'error', 'storage_path_forbidden', payload);
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
