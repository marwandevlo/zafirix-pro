/**
 * DELETE /api/documents/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { ATLAS_DOCUMENTS_BUCKET } from '@/app/lib/atlas-document-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(_request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseServiceRoleClient();

  const { data: row } = await admin
    .from('atlas_documents')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { error } = await admin.from('atlas_documents').delete().eq('id', id).eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const storagePath = (row as { storage_path?: string }).storage_path;
  if (storagePath) {
    await admin.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
  }

  return NextResponse.json({ ok: true });
}
