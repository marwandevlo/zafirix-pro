/**
 * POST /api/supplier-invoices/bulk-delete
 * Body: { companyId: string, ids: string[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { bulkDeleteStatusForError, prepareBulkDeleteIds } from '@/app/lib/atlas-bulk-delete-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { companyId?: string; ids?: string[] };
  try {
    body = (await request.json()) as { companyId?: string; ids?: string[] };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, userId, body.companyId);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.error === 'company_id_required' ? 400 : 403 },
    );
  }

  const prepared = prepareBulkDeleteIds(body.ids);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }

  const { uuidIds, skipped, skippedIds } = prepared;
  if (uuidIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, skipped, skippedIds });
  }

  let deleted = 0;

  for (let i = 0; i < uuidIds.length; i += BATCH_SIZE) {
    const batch = uuidIds.slice(i, i + BATCH_SIZE);
    const { error, count } = await admin
      .from('atlas_supplier_invoices')
      .delete({ count: 'exact' })
      .in('id', batch)
      .eq('company_id', access.companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: bulkDeleteStatusForError(error.message) });
    }

    deleted += count ?? batch.length;
  }

  return NextResponse.json({ ok: true, deleted, skipped, skippedIds });
}
