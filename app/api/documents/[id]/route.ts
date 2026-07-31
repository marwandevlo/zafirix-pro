/**
 * DELETE /api/documents/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { loadDocumentForCompanyAccess } from '@/app/lib/atlas-company-resource-guard';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { ATLAS_DOCUMENTS_BUCKET } from '@/app/lib/atlas-document-storage';
import { revalidateCompanySurfaces } from '@/app/lib/revalidate-company-surfaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(_request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseServiceRoleClient();

  const loaded = await loadDocumentForCompanyAccess(admin, userId, id, 'id, company_id, storage_path');
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const { error } = await admin
    .from('atlas_documents')
    .delete()
    .eq('id', id)
    .eq('company_id', loaded.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const storagePath = loaded.row.storage_path as string | null | undefined;
  if (storagePath) {
    await admin.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
  }

  revalidateCompanySurfaces(loaded.companyId);
  return NextResponse.json({ ok: true });
}
