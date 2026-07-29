import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import {
  ATLAS_DOCUMENTS_BUCKET,
  buildAtlasDocumentStoragePath,
  inferDocumentMimeType,
  isAllowedDocumentMime,
  sanitizeDocumentFilename,
} from '@/app/lib/atlas-document-storage';
import {
  clientPortalDocumentMetadata,
  resolveClientPortalSession,
} from '@/app/lib/atlas-client-portal';
import { registerStoredDocument } from '@/app/lib/atlas-document-upload-register';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  try {
    const form = await request.formData();
    const accessCode = String(form.get('accessCode') ?? '').trim();
    const clientNote = String(form.get('note') ?? '').trim();
    const file = form.get('file');

    if (!accessCode) {
      return NextResponse.json({ error: 'access_code_required' }, { status: 400 });
    }
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'file_required' }, { status: 400 });
    }

    const admin = getSupabaseServiceRoleClient();
    const session = await resolveClientPortalSession(admin, accessCode);
    if (!session) {
      return NextResponse.json({ error: 'invalid_access_code', message: 'Code d\'accès invalide.' }, { status: 401 });
    }

    const filename = sanitizeDocumentFilename(file.name || 'document');
    const mimeType = inferDocumentMimeType({ name: filename, type: file.type });
    if (!isAllowedDocumentMime(mimeType)) {
      return NextResponse.json({ error: 'mime_not_allowed', message: 'Type de fichier non autorisé.' }, { status: 415 });
    }

    const documentId = randomUUID();
    const storagePath = buildAtlasDocumentStoragePath(
      session.ownerUserId,
      session.companyId,
      documentId,
      filename,
    );

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from(ATLAS_DOCUMENTS_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

    if (uploadErr) {
      return NextResponse.json({ error: 'storage_upload_failed', message: uploadErr.message }, { status: 500 });
    }

    const metadata = clientPortalDocumentMetadata({
      originalFilename: filename,
      uploadedBy: 'client_portal',
      clientNote: clientNote || undefined,
    });

    const registerResult = await registerStoredDocument(admin, {
      userId: session.ownerUserId,
      companyId: session.companyId,
      documentId,
      storagePath,
      filename,
      mimeType,
      sizeBytes: file.size,
    });

    if (!registerResult.ok) {
      return NextResponse.json(
        { error: registerResult.code, message: registerResult.message },
        { status: registerResult.httpStatus },
      );
    }

    await admin
      .from('atlas_documents')
      .update({
        metadata,
        title: `Upload client — ${filename}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('user_id', session.ownerUserId);

    await admin.from('zafirix_routing_records').insert({
      user_id: session.ownerUserId,
      company_id: session.companyId,
      source_document_id: documentId,
      source_document_type: 'receipt',
      target_module: 'comptabilite',
      target_entity_type: 'client_upload',
      routing_status: 'completed',
      generated_by: 'client_portal',
      validation_status: 'draft',
      payload: {
        source: 'client_portal',
        clientNote: clientNote || null,
        originalFilename: filename,
      },
    });

    return NextResponse.json({
      ok: true,
      documentId,
      companyName: session.companyName,
      message: 'Document transmis à votre comptable pour validation OCR.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ingest_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
