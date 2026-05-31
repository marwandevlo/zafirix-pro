import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { executeDocumentOcrServer } from '@/app/lib/atlas-document-ocr-runner';
import { isUuid } from '@/app/lib/admin/atlas-admin-profile-fields';
import {
  createDocumentUploadSupabaseClient,
  documentUploadSessionUserId,
} from '@/app/lib/atlas-document-upload-auth';
import { logUploadStep } from '@/app/lib/atlas-document-upload-core';
import { registerStoredDocument, removeOrphanStorageObject } from '@/app/lib/atlas-document-upload-register';

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

  const supabase = await createDocumentUploadSupabaseClient();
  const result = await registerStoredDocument(supabase, {
    userId,
    companyId,
    documentId,
    storagePath,
    filename,
    mimeType,
    sizeBytes,
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

  waitUntil(
    executeDocumentOcrServer(userId, documentId, 'register').catch((err) => {
      console.error('[documents/upload/register] OCR waitUntil failed', documentId, err);
    }),
  );

  return NextResponse.json({
    document: result.document,
    ocrAccepted: result.ocrAccepted,
    processingStatus: 'processing',
    message: 'OCR en arrière-plan',
  });
}
