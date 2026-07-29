/**
 * DELETE /api/invoices/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(_request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseServiceRoleClient();

  const { error } = await admin
    .from('atlas_invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
