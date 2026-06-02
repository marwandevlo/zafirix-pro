/**
 * PATCH /api/share/[token]/revoke
 * Authenticated — revokes a share link immediately.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  const { data: link, error: fetchErr } = await admin
    .from('zafirix_share_links')
    .select('id, entity_type, entity_id, revoked_at')
    .eq('token', token)
    .eq('created_by', userId)
    .maybeSingle();

  if (fetchErr || !link) {
    return NextResponse.json({ error: 'link_not_found' }, { status: 404 });
  }

  if (link.revoked_at) {
    return NextResponse.json({ ok: true, already_revoked: true });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('zafirix_share_links')
    .update({ revoked_at: now })
    .eq('id', String(link.id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit
  void admin.from('atlas_entity_events').insert({
    user_id: userId,
    entity_type: String(link.entity_type),
    entity_id: String(link.entity_id),
    event_type: 'share_revoked',
    payload: { token: token.slice(0, 8) + '…', revoked_at: now },
  });

  return NextResponse.json({ ok: true });
}
