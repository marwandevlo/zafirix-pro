/**
 * PATCH /api/documents/[id]/archive
 * Soft-deletes a document by setting archived_at.
 * Logs to atlas_entity_events.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const admin = getSupabaseServiceRoleClient();

  // Verify ownership
  const { data: doc, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('id, company_id, archived_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  if (doc.archived_at) {
    return NextResponse.json({ ok: true, already_archived: true });
  }

  const now = new Date().toISOString();

  const { error } = await admin
    .from('atlas_documents')
    .update({ archived_at: now, updated_at: now })
    .eq('id', documentId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log (best-effort)
  if (doc.company_id) {
    void admin.from('atlas_entity_events').insert({
      user_id: userId,
      company_id: doc.company_id,
      entity_type: 'document',
      entity_id: documentId,
      event_type: 'archived',
      payload: { archived_at: now },
    });
  }

  return NextResponse.json({ ok: true });
}
