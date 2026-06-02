/**
 * DELETE /api/integrations/google-drive/disconnect
 * Revokes Google OAuth token and removes credentials from DB.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  const { data: creds } = await admin
    .from('zafirix_google_credentials')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (!creds) return NextResponse.json({ ok: true, already_disconnected: true });

  // Best-effort revocation (fire-and-forget)
  void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(String(creds.access_token))}`, {
    method: 'POST',
  });

  await admin
    .from('zafirix_google_credentials')
    .delete()
    .eq('user_id', userId);

  void admin.from('atlas_entity_events').insert({
    user_id: userId,
    entity_type: 'integration',
    entity_id: 'google_drive',
    event_type: 'google_drive_disconnected',
    payload: {},
  });

  return NextResponse.json({ ok: true });
}
