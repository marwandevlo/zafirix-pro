/**
 * POST /api/invoices/bulk-delete
 * Body: { ids: string[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 50;

function deleteStatusForError(message: string): number {
  return /foreign key|23503|violates foreign key/i.test(message) ? 409 : 500;
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { ids?: string[] };
  try {
    body = (await request.json()) as { ids?: string[] };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((id) => String(id).trim()).filter(Boolean))]
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids_required' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  let deleted = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { error, count } = await admin
      .from('atlas_invoices')
      .delete({ count: 'exact' })
      .in('id', batch)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: deleteStatusForError(error.message) });
    }

    deleted += count ?? batch.length;
  }

  return NextResponse.json({ ok: true, deleted });
}
