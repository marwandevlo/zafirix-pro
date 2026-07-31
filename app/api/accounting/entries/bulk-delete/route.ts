/**
 * POST /api/accounting/entries/bulk-delete
 * Body: { ids: string[]; companyId?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { bulkDeleteCompanyScoped } from '@/app/lib/atlas-company-resource-guard';
import { bulkDeleteStatusForError, prepareBulkDeleteIds } from '@/app/lib/atlas-bulk-delete-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { revalidateCompanySurfaces } from '@/app/lib/revalidate-company-surfaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { ids?: string[]; companyId?: string };
  try {
    body = (await request.json()) as { ids?: string[]; companyId?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const prepared = prepareBulkDeleteIds(body.ids);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }

  const { uuidIds, skipped, skippedIds } = prepared;
  if (uuidIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, skipped, skippedIds });
  }

  const admin = getSupabaseServiceRoleClient();
  const result = await bulkDeleteCompanyScoped(
    admin,
    userId,
    'atlas_accounting_entries',
    uuidIds,
    body.companyId,
  );

  if (!result.ok) {
    const status = bulkDeleteStatusForError(result.error);
    return NextResponse.json({ error: result.error }, { status });
  }

  revalidateCompanySurfaces(body.companyId);
  return NextResponse.json({ ok: true, deleted: result.deleted, skipped, skippedIds });
}
