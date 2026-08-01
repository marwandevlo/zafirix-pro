/**
 * Post-storage register + OCR enqueue (heavy deps loaded dynamically).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { frenchMessageForRegisterCode } from '@/app/lib/atlas-document-register-errors';
import {
  ensureCompanyStorageNamespace,
  logUploadStep,
  verifyStorageObjectExists,
  type UploadLogContext,
} from '@/app/lib/atlas-document-upload-core';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  ATLAS_DOCUMENTS_BUCKET,
  buildAtlasDocumentWorkingStoragePath,
  documentUploadLimitExceededMessage,
  isPdfMimeType,
  maxUploadBytesForMime,
  normalizeAtlasDocumentStoragePath,
  parseAtlasDocumentStoragePath,
  sanitizeDocumentFilename,
  validateRegisterCompanyStoragePath,
  type StoragePathValidationFailure,
} from '@/app/lib/atlas-document-storage';
import { canAccessCompany, resolveCompanyRole, type CompanyRoleContext } from '@/app/lib/atlas-permissions';
import {
  buildRegisterPathForbiddenLogPayload,
  buildStoragePathForbiddenDiagnostic,
  logRegisterStoragePathForbidden,
  logStoragePathValidationFailureDetailed,
  type RegisterPathForbiddenLogPayload,
  type RegisterPathPermissionSnapshot,
  type RegisterStoredDocumentRequestSnapshot,
  type StoragePathForbiddenDiagnostic,
  type StoragePathForbiddenTrigger,
} from '@/app/lib/atlas-document-storage-path-debug';

export type RegisterStoredDocumentInput = {
  userId: string;
  companyId: string;
  documentId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash?: string;
};

export type RegisterStoredDocumentResult =
  | {
      ok: true;
      document: {
        id: string;
        companyId: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        storagePath: string;
        processingStatus: 'processing';
        compressed: boolean;
      };
      ocrAccepted: true;
      existingDocumentReused?: boolean;
    }
  | { ok: false; code: string; message: string; httpStatus: number; debug?: StoragePathForbiddenDiagnostic; forbiddenLog?: RegisterPathForbiddenLogPayload };


function registerFailure(
  code: string,
  rawMessage: string | undefined,
  httpStatus: number,
  ctx: UploadLogContext,
  step: string,
  options?: { debug?: StoragePathForbiddenDiagnostic; forbiddenLog?: RegisterPathForbiddenLogPayload },
): RegisterStoredDocumentResult {
  const message = frenchMessageForRegisterCode(code, rawMessage);
  logUploadStep(step, 'error', message, ctx, {
    code,
    rawMessage: rawMessage?.slice(0, 500),
    bucket: ATLAS_DOCUMENTS_BUCKET,
    ...(options?.debug ? { storagePathDebug: options.debug } : {}),
    ...(options?.forbiddenLog ? { storagePathForbiddenLog: options.forbiddenLog } : {}),
  });
  if (code === 'storage_path_forbidden' && options?.forbiddenLog) {
    logRegisterStoragePathForbidden(options.forbiddenLog);
  }
  return {
    ok: false,
    code,
    message,
    httpStatus,
    ...(options?.debug ? { debug: options.debug } : {}),
    ...(options?.forbiddenLog ? { forbiddenLog: options.forbiddenLog } : {}),
  };
}

function requestSnapshot(input: RegisterStoredDocumentInput): RegisterStoredDocumentRequestSnapshot {
  return {
    sessionUserId: input.userId,
    bodyCompanyId: input.companyId,
    bodyDocumentId: input.documentId,
    storagePathRaw: input.storagePath,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256Hash: input.sha256Hash,
  };
}

function failStoragePathForbidden(
  input: RegisterStoredDocumentInput,
  ctx: UploadLogContext,
  step: string,
  trigger: StoragePathForbiddenTrigger,
  failureReason: string,
  permissions: RegisterPathPermissionSnapshot,
  parsed: ReturnType<typeof parseAtlasDocumentStoragePath>,
  validation?: StoragePathValidationFailure | null,
  extra?: Record<string, unknown>,
): RegisterStoredDocumentResult {
  const request = requestSnapshot(input);
  const debug = buildStoragePathForbiddenDiagnostic({
    trigger,
    reason: failureReason,
    sessionUserId: input.userId,
    storagePath: input.storagePath,
    companyId: input.companyId,
    documentId: input.documentId,
    roleContext: permissions.sessionRole,
    extra,
  });
  const forbiddenLog = buildRegisterPathForbiddenLogPayload({
    layer: 'register_core',
    step,
    trigger,
    failureReason,
    request,
    parsed,
    permissions,
    validation,
    extra,
  });
  if (validation) {
    logStoragePathValidationFailureDetailed(validation, debug);
  }
  return registerFailure('storage_path_forbidden', failureReason, 403, ctx, step, { debug, forbiddenLog });
}

function asPlainMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  return meta && typeof meta === 'object' ? { ...meta } : {};
}

/** After client Storage upload: insert row, compress image, enqueue OCR from Storage. */
export async function registerStoredDocument(
  supabase: SupabaseClient,
  input: RegisterStoredDocumentInput,
): Promise<RegisterStoredDocumentResult> {
  const { userId, companyId, documentId, storagePath, filename, mimeType, sizeBytes, sha256Hash } = input;
  const normalizedStoragePath = normalizeAtlasDocumentStoragePath(storagePath);
  const ctx: UploadLogContext = {
    userId,
    companyId,
    documentId,
    mimeType,
    fileSize: sizeBytes,
    storagePath: normalizedStoragePath,
  };

  let admin: SupabaseClient;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'service_role_missing';
    return registerFailure('server_misconfigured', msg, 503, ctx, 'register_admin');
  }

  let roleContext: CompanyRoleContext = { role: null, workspaceId: null, owned: false };
  if (companyId) {
    roleContext = await resolveCompanyRole(admin, userId, companyId);
  }

  const parsedEarly = parseAtlasDocumentStoragePath(normalizedStoragePath);
  if (!parsedEarly) {
    const bodyCompanyAccess = companyId ? await canAccessCompany(admin, userId, companyId) : null;
    const failure: StoragePathValidationFailure = {
      ok: false,
      code: 'storage_path_forbidden',
      reason: 'parse_failed',
      expected: { userId, companyId, documentId },
      received: {
        storagePath,
        normalizedPath: normalizedStoragePath,
        parsed: null,
      },
    };
    return failStoragePathForbidden(
      input,
      ctx,
      'register_path',
      'register_path_ownership',
      'parse_failed',
      {
        effectiveCompanyId: companyId,
        pathUserMatchesSession: false,
        allowWorkspaceCompanyPath: false,
        companyInPathMatches: null,
        canAccessCompanySessionUser: bodyCompanyAccess,
        canAccessCompanyPathUser: null,
        canAccessCompanyBodyCompany: bodyCompanyAccess,
        sessionRole: roleContext,
      },
      null,
      failure,
    );
  }

  const effectiveCompanyIdEarly = parsedEarly.companyId ?? companyId;
  if (!effectiveCompanyIdEarly) {
    return failStoragePathForbidden(
      input,
      ctx,
      'register_path',
      'register_path_validate',
      'company_id_missing',
      {
        effectiveCompanyId: null,
        pathUserMatchesSession: parsedEarly.userId === userId.trim().toLowerCase(),
        allowWorkspaceCompanyPath: false,
        companyInPathMatches: null,
        canAccessCompanySessionUser: null,
        canAccessCompanyPathUser: null,
        canAccessCompanyBodyCompany: null,
        sessionRole: roleContext,
        pathUserRole: null,
      },
      parsedEarly,
    );
  }

  const sessionCompanyAccess = await canAccessCompany(admin, userId, effectiveCompanyIdEarly);
  const sessionRoleEffective = await resolveCompanyRole(admin, userId, effectiveCompanyIdEarly);
  roleContext = sessionRoleEffective;

  if (!sessionCompanyAccess) {
    return registerFailure(
      'company_not_found_or_forbidden',
      'Company access denied',
      403,
      { ...ctx, companyId: effectiveCompanyIdEarly },
      'register_company',
    );
  }

  const pathUserMatchesSession = parsedEarly.userId === userId.trim().toLowerCase();
  const companyInPathMatches =
    !parsedEarly.companyId || parsedEarly.companyId === effectiveCompanyIdEarly.trim().toLowerCase();

  // Company access is the gate — path[0] may be owner or any member who uploaded the file.
  const allowWorkspaceCompanyPath = true;

  if (!pathUserMatchesSession) {
    logUploadStep('register_path', 'info', 'workspace_storage_path_user_prefix_accepted', ctx, {
      pathUserId: parsedEarly.userId,
      sessionUserId: userId,
      effectiveCompanyId: effectiveCompanyIdEarly,
      userRole: roleContext.role,
      canAccessCompanySessionUser: sessionCompanyAccess,
      companyInPathMatches,
      note: 'Register accepts path prefix user when session has company access',
    });
  }

  const pathValidation = validateRegisterCompanyStoragePath(normalizedStoragePath, { documentId });
  if (!pathValidation.ok) {
    return failStoragePathForbidden(
      input,
      ctx,
      'register_path',
      'register_path_validate',
      pathValidation.reason,
      {
        effectiveCompanyId: effectiveCompanyIdEarly,
        pathUserMatchesSession,
        allowWorkspaceCompanyPath,
        companyInPathMatches,
        canAccessCompanySessionUser: sessionCompanyAccess,
        canAccessCompanyPathUser: null,
        canAccessCompanyBodyCompany: await canAccessCompany(admin, userId, companyId),
        sessionRole: roleContext,
        pathUserRole: null,
      },
      parsedEarly,
      pathValidation,
    );
  }

  const effectiveCompanyId = pathValidation.parsed.companyId ?? companyId;
  const pathUserId = pathValidation.parsed.userId;
  roleContext = await resolveCompanyRole(admin, userId, effectiveCompanyId);

  if (companyId && companyId !== effectiveCompanyId) {
    logUploadStep('register_path', 'warn', 'company_id_body_path_mismatch_using_path', ctx, {
      bodyCompanyId: companyId,
      pathCompanyId: effectiveCompanyId,
    });
  }

  const maxBytes = maxUploadBytesForMime(mimeType);
  if (sizeBytes > maxBytes) {
    return registerFailure('file_too_large', documentUploadLimitExceededMessage(mimeType), 413, ctx, 'register_size');
  }

  await ensureCompanyStorageNamespace(admin, pathUserId, effectiveCompanyId);

  const verify = await verifyStorageObjectExists(admin, normalizedStoragePath);
  if (!verify.ok) {
    const httpStatus =
      verify.code === 'storage_object_missing' ? 400 : verify.code === 'storage_path_forbidden' ? 403 : 502;
    if (verify.code === 'storage_path_forbidden') {
      return failStoragePathForbidden(
        input,
        ctx,
        'register_storage_verify',
        'register_storage_verify_parse',
        verify.message,
        {
          effectiveCompanyId,
          pathUserMatchesSession,
          allowWorkspaceCompanyPath,
          companyInPathMatches,
          canAccessCompanySessionUser: sessionCompanyAccess,
          canAccessCompanyPathUser: null,
          canAccessCompanyBodyCompany: await canAccessCompany(admin, userId, companyId),
          sessionRole: roleContext,
          pathUserRole: null,
        },
        parsedEarly,
        null,
        { verifyCode: verify.code, verifyMessage: verify.message },
      );
    }
    return registerFailure(verify.code, verify.message, httpStatus, ctx, 'register_storage_verify');
  }

  const safeName = sanitizeDocumentFilename(filename);

  // ── SHA256 dedup (highest priority) ──────────────────────────────────────
  // If the same file hash is already processed for this company, reuse it.
  let existingProcessed: { id: string; storage_path: string | null } | null = null;

  if (sha256Hash && sha256Hash.length === 64) {
    const { data: hashMatch } = await admin
      .from('atlas_documents')
      .select('id, storage_path')
      .eq('company_id', effectiveCompanyId)
      .eq('sha256_hash', sha256Hash)
      .eq('processing_status', 'processed')
      .eq('source', 'ocr')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    existingProcessed = hashMatch;
  }

  // ── Filename + size dedup (fallback) ─────────────────────────────────────
  if (!existingProcessed?.id) {
    const { data: nameMatch } = await admin
      .from('atlas_documents')
      .select('id, storage_path')
      .eq('company_id', effectiveCompanyId)
      .eq('filename', safeName)
      .eq('size_bytes', sizeBytes)
      .eq('processing_status', 'processed')
      .eq('source', 'ocr')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    existingProcessed = nameMatch;
  }

  if (!existingProcessed?.id && isPdfMimeType(mimeType)) {
    // Fallback: same PDF size for this company — likely same file, different browser filename
    const { data: sizeMatch } = await admin
      .from('atlas_documents')
      .select('id, storage_path')
      .eq('company_id', effectiveCompanyId)
      .eq('size_bytes', sizeBytes)
      .eq('mime_type', mimeType)
      .eq('processing_status', 'processed')
      .eq('source', 'ocr')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    existingProcessed = sizeMatch;
  }

  if (existingProcessed?.id) {
    logUploadStep('register_dedup', 'info', 'reusing_existing_processed_document', ctx, {
      existingId: existingProcessed.id,
      sha256Used: Boolean(sha256Hash),
      note: 'Same document already processed — skipping duplicate insert',
    });
    // Remove the orphan storage object that was just uploaded for the new UUID
    await admin.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([normalizedStoragePath]).catch(() => {});
    return {
      ok: true,
      document: {
        id: existingProcessed.id,
        companyId: effectiveCompanyId,
        filename: safeName,
        mimeType,
        sizeBytes,
        storagePath: existingProcessed.storage_path ?? normalizedStoragePath,
        processingStatus: 'processing',
        compressed: false,
      },
      ocrAccepted: true,
      existingDocumentReused: true,
    };
  }

  let metadata: Record<string, unknown> = {
    storage: { original_storage_path: normalizedStoragePath },
  };
  let compressed = false;

  if (!isPdfMimeType(mimeType)) {
    const { data: fileBlob, error: downloadErr } = await admin.storage
      .from(ATLAS_DOCUMENTS_BUCKET)
      .download(normalizedStoragePath);

    if (downloadErr || !fileBlob) {
      const msg = downloadErr?.message ?? 'download failed';
      const code = /not found|404/i.test(msg) ? 'storage_object_missing' : 'storage_service_read_failed';
      return registerFailure(code, msg, code === 'storage_object_missing' ? 400 : 502, ctx, 'register_image_download');
    }

    try {
      const { prepareUploadedImageForOcr } = await import('@/app/lib/atlas-document-image-upload');
      const bytes = Buffer.from(await fileBlob.arrayBuffer());
      const prepared = await prepareUploadedImageForOcr(bytes, mimeType);
      if (prepared.compressed) {
        const workingPath = buildAtlasDocumentWorkingStoragePath(pathUserId, effectiveCompanyId, documentId);
        const { error: workingErr } = await admin.storage
          .from(ATLAS_DOCUMENTS_BUCKET)
          .upload(workingPath, prepared.ocrBuffer, {
            contentType: prepared.ocrMimeType,
            upsert: true,
          });

        if (workingErr) {
          return registerFailure('working_copy_failed', workingErr.message, 500, ctx, 'register_working_copy');
        }

        compressed = true;
        metadata = {
          storage: {
            original_storage_path: normalizedStoragePath,
            working_storage_path: workingPath,
            compressed: true,
            original_bytes: prepared.originalBytes,
            ocr_bytes: prepared.ocrBytes,
          },
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'image_compress_failed';
      return registerFailure('image_compress_failed', message, 422, ctx, 'register_image_compress');
    }
  }

  logUploadStep('register', 'info', 'db_insert_start', ctx);

  const { error: insertErr } = await admin.from('atlas_documents').insert({
    id: documentId,
    user_id: userId,
    company_id: effectiveCompanyId,
    type: 'ocr',
    title: safeName,
    kind: 'upload',
    source: 'ocr',
    status: 'active',
    filename: safeName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    storage_path: normalizedStoragePath,
    processing_status: 'processing',
    sha256_hash: sha256Hash ?? null,
    metadata,
  });

  if (insertErr) {
    return registerFailure('db_insert_failed', insertErr.message, 500, ctx, 'register_db_insert');
  }

  const row = {
    id: documentId,
    mime_type: mimeType,
    storage_path: normalizedStoragePath,
    filename: safeName,
    size_bytes: sizeBytes,
    metadata,
  };

  logUploadStep('register_complete', 'info', 'document_registered_ocr_via_api', ctx, {
    compressed,
    note: 'Client POST /api/documents/[id]/ocr runs OCR (serverless-safe)',
  });

  return {
    ok: true,
    document: {
      id: documentId,
      companyId: effectiveCompanyId,
      filename: safeName,
      mimeType,
      sizeBytes,
      storagePath: normalizedStoragePath,
      processingStatus: 'processing',
      compressed,
    },
    ocrAccepted: true,
  };
}

export async function removeOrphanStorageObject(
  _supabase: SupabaseClient | null,
  storagePath: string,
): Promise<void> {
  try {
    const admin = getSupabaseServiceRoleClient();
    await admin.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
  } catch {
    /* best effort */
  }
}
