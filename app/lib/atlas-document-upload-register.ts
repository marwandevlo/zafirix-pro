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
  validateAtlasDocumentStoragePath,
  type StoragePathValidationFailure,
} from '@/app/lib/atlas-document-storage';
import { canAccessCompany, resolveCompanyRole, type CompanyRoleContext } from '@/app/lib/atlas-permissions';
import {
  buildStoragePathForbiddenDiagnostic,
  logStoragePathForbiddenDiagnostic,
  logStoragePathValidationFailureDetailed,
  type StoragePathForbiddenDiagnostic,
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
  | { ok: false; code: string; message: string; httpStatus: number; debug?: StoragePathForbiddenDiagnostic };


function registerFailure(
  code: string,
  rawMessage: string | undefined,
  httpStatus: number,
  ctx: UploadLogContext,
  step: string,
  debug?: StoragePathForbiddenDiagnostic,
): RegisterStoredDocumentResult {
  const message = frenchMessageForRegisterCode(code, rawMessage);
  logUploadStep(step, 'error', message, ctx, {
    code,
    rawMessage: rawMessage?.slice(0, 500),
    bucket: ATLAS_DOCUMENTS_BUCKET,
    ...(debug ? { storagePathDebug: debug } : {}),
  });
  if (debug) {
    logStoragePathForbiddenDiagnostic(debug);
  }
  return { ok: false, code, message, httpStatus, ...(debug ? { debug } : {}) };
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

  const pathDiagBase = {
    sessionUserId: userId,
    storagePath,
    companyId,
    documentId,
    roleContext,
  };

  const parsedEarly = parseAtlasDocumentStoragePath(normalizedStoragePath);
  if (!parsedEarly) {
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
    const debug = buildStoragePathForbiddenDiagnostic({
      trigger: 'register_path_ownership',
      reason: 'parse_failed',
      ...pathDiagBase,
    });
    logStoragePathValidationFailureDetailed(failure, debug);
    return registerFailure('storage_path_forbidden', undefined, 403, ctx, 'register_path', debug);
  }

  const effectiveCompanyIdEarly = parsedEarly.companyId ?? companyId;
  if (!effectiveCompanyIdEarly) {
    const debug = buildStoragePathForbiddenDiagnostic({
      trigger: 'register_path_validate',
      reason: 'company_id_missing',
      ...pathDiagBase,
    });
    return registerFailure('storage_path_forbidden', 'Company id missing from path', 403, ctx, 'register_path', debug);
  }

  const sessionCompanyAccess = await canAccessCompany(admin, userId, effectiveCompanyIdEarly);
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
  let allowWorkspaceCompanyPath = pathUserMatchesSession;

  if (!pathUserMatchesSession) {
    const pathUserCompanyAccess = await canAccessCompany(admin, parsedEarly.userId, effectiveCompanyIdEarly);
    const companyInPathMatches =
      !parsedEarly.companyId ||
      parsedEarly.companyId === effectiveCompanyIdEarly.trim().toLowerCase();

    allowWorkspaceCompanyPath =
      pathUserCompanyAccess && sessionCompanyAccess && companyInPathMatches;

    if (!allowWorkspaceCompanyPath) {
      const failure: StoragePathValidationFailure = {
        ok: false,
        code: 'storage_path_forbidden',
        reason: 'user_id_mismatch',
        expected: { userId, companyId, documentId },
        received: {
          storagePath,
          normalizedPath: normalizedStoragePath,
          parsed: parsedEarly,
        },
      };
      const debug = buildStoragePathForbiddenDiagnostic({
        trigger: 'register_path_ownership',
        reason: 'user_id_mismatch',
        ...pathDiagBase,
        extra: {
          pathUserId: parsedEarly.userId,
          sessionUserId: userId,
          pathUserCompanyAccess,
          sessionCompanyAccess,
          companyInPathMatches,
          effectiveCompanyId: effectiveCompanyIdEarly,
        },
      });
      logStoragePathValidationFailureDetailed(failure, debug);
      return registerFailure('storage_path_forbidden', undefined, 403, ctx, 'register_path', debug);
    }

    logUploadStep('register_path', 'warn', 'workspace_storage_path_user_prefix_relaxed', ctx, {
      pathUserId: parsedEarly.userId,
      sessionUserId: userId,
      effectiveCompanyId: effectiveCompanyIdEarly,
      userRole: roleContext.role,
    });
  }

  const pathValidation = validateAtlasDocumentStoragePath(normalizedStoragePath, {
    userId,
    companyId,
    documentId,
    allowWorkspaceCompanyPath,
  });
  if (!pathValidation.ok) {
    const debug = buildStoragePathForbiddenDiagnostic({
      trigger: 'register_path_validate',
      reason: pathValidation.reason,
      ...pathDiagBase,
      extra: {
        expected: pathValidation.expected,
        received: pathValidation.received,
      },
    });
    logStoragePathValidationFailureDetailed(pathValidation, debug);
    return registerFailure(
      'storage_path_forbidden',
      `Path validation failed (${pathValidation.reason})`,
      403,
      ctx,
      'register_path',
      debug,
    );
  }

  const effectiveCompanyId = pathValidation.parsed.companyId ?? companyId;
  const pathUserId = pathValidation.parsed.userId;
  roleContext = await resolveCompanyRole(admin, userId, effectiveCompanyId);
  const pathDiagEffective = { ...pathDiagBase, companyId: effectiveCompanyId, roleContext };

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
    const debug =
      verify.code === 'storage_path_forbidden'
        ? buildStoragePathForbiddenDiagnostic({
            trigger: 'register_storage_verify_parse',
            reason: verify.message,
            ...pathDiagEffective,
          })
        : undefined;
    return registerFailure(verify.code, verify.message, httpStatus, ctx, 'register_storage_verify', debug);
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
