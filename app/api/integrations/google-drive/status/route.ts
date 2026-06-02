/**
 * GET /api/integrations/google-drive/status
 * Returns connection status for the authenticated user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { isGoogleDriveConfigured } from '@/app/lib/atlas-google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const configured = isGoogleDriveConfigured();

  const admin = getSupabaseServiceRoleClient();
  const { data: creds } = await admin
    .from('zafirix_google_credentials')
    .select('google_email, connected_at, updated_at, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  return NextResponse.json({
    configured,
    connected: !!creds,
    email: creds?.google_email ?? null,
    connectedAt: creds?.connected_at ?? null,
    lastRefreshed: creds?.updated_at ?? null,
    tokenExpiry: creds?.expires_at ?? null,
  });
}
