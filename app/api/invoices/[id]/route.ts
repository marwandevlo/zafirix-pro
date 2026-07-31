/**
 * DELETE /api/invoices/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { assertUserCompanyAccess, bulkDeleteCompanyScoped } from '@/app/lib/atlas-company-resource-guard';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
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

  const { data: row } = await admin.from('atlas_invoices').select('company_id').eq('id', id).maybeSingle();
  if (!row?.company_id) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const companyId = String(row.company_id);
  const access = await assertUserCompanyAccess(admin, userId, companyId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const result = await bulkDeleteCompanyScoped(admin, userId, 'atlas_invoices', [id], access.companyId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  revalidateCompanySurfaces(access.companyId);
  return NextResponse.json({ ok: true });
}
