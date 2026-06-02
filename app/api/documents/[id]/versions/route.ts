/**
 * GET /api/documents/[id]/versions
 * Returns the version history for a document (from zafirix_file_versions + zafirix_exports).
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  // Verify document ownership
  const { data: doc } = await admin
    .from('atlas_documents')
    .select('id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: 'document_not_found' }, { status: 404 });

  const [{ data: versions }, { data: exports }] = await Promise.all([
    admin
      .from('zafirix_file_versions')
      .select('id, file_format, filename, file_size_bytes, google_drive_url, created_at')
      .eq('entity_type', 'document')
      .eq('entity_id', documentId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    admin
      .from('zafirix_exports')
      .select('id, format, filename, file_size_bytes, created_at')
      .eq('entity_type', 'document')
      .eq('entity_id', documentId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Merge: versions (Drive uploads) + exports (local downloads), deduplicated by filename + date
  const items = [
    ...(versions ?? []).map((v: Record<string, unknown>) => ({
      id: v.id,
      source: 'google_drive',
      format: v.file_format,
      filename: v.filename,
      sizeBytes: v.file_size_bytes,
      url: v.google_drive_url,
      downloadUrl: v.google_drive_url ? String(v.google_drive_url) : null,
      createdAt: v.created_at,
    })),
    ...(exports ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      source: 'local_export',
      format: e.format,
      filename: e.filename,
      sizeBytes: e.file_size_bytes,
      url: null,
      downloadUrl: `/api/documents/${documentId}/export?format=${String(e.format)}`,
      createdAt: e.created_at,
    })),
  ].sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());

  return NextResponse.json({ versions: items });
}
