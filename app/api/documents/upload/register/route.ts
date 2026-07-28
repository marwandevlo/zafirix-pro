import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { scheduleVercelBackground } from '@/app/lib/atlas-vercel-background';
import { isUuid } from '@/app/lib/admin/atlas-admin-profile-fields';
import {
  createDocumentUploadSupabaseClient,
  documentUploadSessionUserId,
} from '@/app/lib/atlas-document-upload-auth';
import { logUploadStep } from '@/app/lib/atlas-document-upload-core';
import { registerStoredDocument, removeOrphanStorageObject } from '@/app/lib/atlas-document-upload-register';
import { canAccessCompany } from '@/app/lib/atlas-permissions';
import { checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RegisterBody = {
  documentId?: string;
  companyId?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  sha256Hash?: string;
};

function uploadErrorResponse(
  status: number,
  step: string,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: code, code, step, message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return uploadErrorResponse(400, 'backend', 'not_enabled', 'Supabase not enabled');
  }

  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return uploadErrorResponse(401, 'auth', 'auth_required', 'Session expirée. Reconnectez-vous.');
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return uploadErrorResponse(400, 'json_parse', 'invalid_json', 'Invalid JSON body');
  }

  const documentId = String(body.documentId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  const filename = String(body.filename ?? 'document').trim();
  const mimeType = String(body.mimeType ?? '').trim().toLowerCase();
  const sizeBytes = Number(body.sizeBytes ?? 0);
  const storagePath = String(body.storagePath ?? '').trim();
  const sha256Hash = body.sha256Hash ? String(body.sha256Hash).trim().toLowerCase() : undefined;

  logUploadStep('register', 'info', 'upload_register_metadata', {
    userId,
    companyId,
    documentId,
    mimeType,
    fileSize: sizeBytes,
    storagePath,
  });

  if (!documentId || !isUuid(documentId)) {
    return uploadErrorResponse(400, 'validation', 'document_required', 'Valid documentId required');
  }
  if (!companyId || !isUuid(companyId)) {
    return uploadErrorResponse(400, 'validation', 'company_required', 'Valid companyId required');
  }
  if (!storagePath) {
    return uploadErrorResponse(400, 'validation', 'storage_path_required', 'storagePath required');
  }
  if (!mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return uploadErrorResponse(400, 'validation', 'file_required', 'mimeType and sizeBytes required');
  }

  const adminDb = getSupabaseServiceRoleClient();
  const allowed = await canAccessCompany(adminDb, userId, companyId);
  if (!allowed) {
    return uploadErrorResponse(403, 'auth', 'company_forbidden', 'Accès société refusé.');
  }

  const { workspaceId } = await ensureWorkspaceSubscription(adminDb, userId);
  const wsRate = checkWorkspaceRateLimit(workspaceId, 'document_upload', userId);
  if (!wsRate.ok) {
    const rl = rateLimitResponse(wsRate);
    return uploadErrorResponse(429, 'rate', rl.body.code, 'Trop de téléversements. Réessayez plus tard.', {
      retryAfterSec: rl.body.retryAfterSec,
    });
  }

  const meter = await meterFeatureUsage(adminDb, userId, 'document_upload', { companyId });
  if (!meter.ok) {
    return uploadErrorResponse(meter.status, 'quota', meter.code, meter.messageFr ?? 'Quota atteint.');
  }

  const supabase = await createDocumentUploadSupabaseClient();
  const result = await registerStoredDocument(supabase, {
    userId,
    companyId,
    documentId,
    storagePath,
    filename,
    mimeType,
    sizeBytes,
    sha256Hash,
  });

  if (!result.ok) {
    logUploadStep('register_failed', 'error', result.message, { userId, documentId, companyId }, {
      code: result.code,
    });

    if (result.code === 'storage_object_missing') {
      await removeOrphanStorageObject(supabase, storagePath).catch(() => {});
    }

    return uploadErrorResponse(result.httpStatus, 'register', result.code, result.message, { documentId });
  }

  logUploadStep('register_complete', 'info', 'ocr_job_enqueued', {
    userId,
    documentId,
    companyId,
    storagePath,
    mimeType,
    fileSize: sizeBytes,
  });

  // If an existing processed document was reused, skip OCR — run auto-posting if needed.
  if (!result.existingDocumentReused) {
    scheduleVercelBackground(async () => {
      const { executeDocumentOcrServer } = await import('@/app/lib/atlas-document-ocr-runner');
      await executeDocumentOcrServer(userId, result.document.id, 'register');
    });
  } else {
    scheduleVercelBackground(async () => {
      const { runDocumentAutoPipeline } = await import('@/app/lib/atlas-document-auto-pipeline');
      await runDocumentAutoPipeline(userId, result.document.id, 'register');
    });
  }

  return NextResponse.json({
    success: true,
    documentId: result.document.id,
    document: result.document,
    ocrAccepted: result.ocrAccepted,
    existingDocumentReused: result.existingDocumentReused ?? false,
    processingStatus: 'processing',
    message: result.existingDocumentReused ? 'Document déjà analysé, résultat réutilisé.' : 'OCR en arrière-plan',
  });
}
