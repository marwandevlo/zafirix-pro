/**
 * POST /api/documents/[id]/validate
 * PUT  /api/documents/[id]/validate
 *
 * Validate or reject a processed document.
 * Body: { action: 'validated' | 'rejected' | 'needs_correction', note?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logDocumentEvent } from '@/app/lib/atlas-document-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ValidateBody = {
  action?: string;
  note?: string;
};

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

  let body: ValidateBody;
  try {
    body = (await request.json()) as ValidateBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = String(body.action ?? '').trim();
  if (!['validated', 'rejected', 'needs_correction'].includes(action)) {
    return NextResponse.json({ error: 'invalid_action', message: 'action must be validated|rejected|needs_correction' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();

  const { data: doc, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('id, company_id, processing_status, validation_status')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  if (doc.processing_status !== 'processed') {
    return NextResponse.json({ error: 'document_not_processed', message: 'Document must be processed before validation' }, { status: 422 });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from('atlas_documents')
    .update({
      validation_status: action,
      validated_at: action === 'validated' ? now : null,
      validated_by: action === 'validated' ? auth.userId : null,
      updated_at: now,
    })
    .eq('id', documentId)
    .eq('user_id', auth.userId);

  if (updateErr) {
    return NextResponse.json({ error: 'update_failed', message: updateErr.message }, { status: 500 });
  }

  // Log event
  if (doc.company_id) {
    void logDocumentEvent({
      companyId: doc.company_id,
      documentId,
      userId: auth.userId,
      eventType: action === 'validated' ? 'user_validated' : action === 'rejected' ? 'user_rejected' : 'validation_required',
      payload: { action, note: body.note ?? null, previous_status: doc.validation_status },
    });
  }

  return NextResponse.json({ ok: true, validation_status: action });
}
