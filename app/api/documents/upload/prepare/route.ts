import { NextRequest, NextResponse } from 'next/server';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { isUuid } from '@/app/lib/admin/atlas-admin-profile-fields';
import { ATLAS_DOCUMENTS_BUCKET } from '@/app/lib/atlas-document-storage';
import { logUploadStep, prepareStorageUploadSlot } from '@/app/lib/atlas-document-upload-core';
import {
  createDocumentUploadSupabaseClient,
  documentUploadSessionUserId,
} from '@/app/lib/atlas-document-upload-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PrepareBody = {
  companyId?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
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

  let body: PrepareBody;
  try {
    body = (await request.json()) as PrepareBody;
  } catch {
    return uploadErrorResponse(400, 'json_parse', 'invalid_json', 'Invalid JSON body');
  }

  const companyId = String(body.companyId ?? '').trim();
  const filename = String(body.filename ?? 'document').trim();
  const mimeType = String(body.mimeType ?? '').trim().toLowerCase();
  const sizeBytes = Number(body.sizeBytes ?? 0);

  logUploadStep('prepare', 'info', 'upload_prepare', { userId, companyId, mimeType, fileSize: sizeBytes });

  if (!companyId || !isUuid(companyId)) {
    return uploadErrorResponse(400, 'validation', 'company_required', 'Valid companyId required');
  }
  if (!mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return uploadErrorResponse(400, 'validation', 'file_required', 'mimeType and sizeBytes required');
  }

  const supabase = await createDocumentUploadSupabaseClient();
  const slot = await prepareStorageUploadSlot(supabase, {
    userId,
    companyId,
    filename,
    mimeType,
    sizeBytes,
  });

  if (!slot.ok) {
    logUploadStep('prepare', 'error', slot.message, { userId, companyId, mimeType, fileSize: sizeBytes }, {
      code: slot.code,
    });
    return uploadErrorResponse(slot.httpStatus, 'prepare', slot.code, slot.message);
  }

  logUploadStep('prepare_complete', 'info', 'storage_slot_ready', {
    userId,
    companyId,
    documentId: slot.documentId,
    storagePath: slot.storagePath,
    mimeType,
    fileSize: sizeBytes,
  });

  return NextResponse.json({
    documentId: slot.documentId,
    storagePath: slot.storagePath,
    bucket: ATLAS_DOCUMENTS_BUCKET,
    uploadMode: 'authenticated_storage',
  });
}
