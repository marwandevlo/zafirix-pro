/**
 * POST /api/documents/[id]/corrections
 * GET  /api/documents/[id]/corrections
 *
 * Store or retrieve user corrections for extracted fields.
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logDocumentEvent } from '@/app/lib/atlas-document-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CorrectionBody = {
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  rawValue?: string;
  confidenceBefore?: number;
  correctionReason?: string;
  sourcePage?: number;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }
  const auth = { userId };

  const admin = getSupabaseServiceRoleClient();

  // Verify ownership
  const { data: doc } = await admin
    .from('atlas_documents')
    .select('id, company_id')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  const { data: corrections, error } = await admin
    .from('zafirix_corrections')
    .select('*')
    .eq('source_document_id', documentId)
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'fetch_failed', message: error.message }, { status: 500 });
  }

  return NextResponse.json({ corrections: corrections ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }
  const auth = { userId };

  let body: CorrectionBody;
  try {
    body = (await request.json()) as CorrectionBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const fieldName = String(body.fieldName ?? '').trim();
  if (!fieldName) {
    return NextResponse.json({ error: 'field_name_required' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();

  const { data: doc } = await admin
    .from('atlas_documents')
    .select('id, company_id, metadata')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  // Store correction
  const { data: correction, error: insertErr } = await admin
    .from('zafirix_corrections')
    .insert({
      company_id: doc.company_id,
      user_id: auth.userId,
      module: 'documents',
      entity_type: 'document',
      entity_id: documentId,
      field_name: fieldName,
      old_value: body.oldValue ?? null,
      new_value: body.newValue ?? null,
      raw_value: body.rawValue ?? null,
      confidence_before: body.confidenceBefore ?? null,
      correction_reason: body.correctionReason ?? null,
      source_document_id: documentId,
      source_page: body.sourcePage ?? null,
    })
    .select('id')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: 'insert_failed', message: insertErr.message }, { status: 500 });
  }

  // Update the user_corrected_value in the document's extraction metadata
  if (doc.metadata && typeof doc.metadata === 'object') {
    const meta = doc.metadata as Record<string, unknown>;
    const extraction = (meta.extraction && typeof meta.extraction === 'object')
      ? { ...(meta.extraction as Record<string, unknown>) }
      : {};

    const field = (extraction[fieldName] && typeof extraction[fieldName] === 'object')
      ? { ...(extraction[fieldName] as Record<string, unknown>) }
      : {};

    field.user_corrected_value = body.newValue ?? null;
    field.user_verified = true;
    extraction[fieldName] = field;

    await admin
      .from('atlas_documents')
      .update({
        metadata: { ...meta, extraction },
        validation_status: 'needs_correction',
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('user_id', auth.userId);
  }

  // Log event
  if (doc.company_id) {
    void logDocumentEvent({
      companyId: doc.company_id,
      documentId,
      userId: auth.userId,
      eventType: 'user_corrected',
      payload: { fieldName, oldValue: body.oldValue, newValue: body.newValue, confidenceBefore: body.confidenceBefore },
    });
  }

  return NextResponse.json({ ok: true, correctionId: correction?.id });
}
