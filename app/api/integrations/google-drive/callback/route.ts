/**
 * GET /api/integrations/google-drive/callback
 * OAuth2 callback. Exchanges code for tokens and stores them.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  exchangeCodeForTokens,
  getGoogleUserEmail,
} from '@/app/lib/atlas-google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  const origin = request.nextUrl.origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/backup?error=${error ?? 'oauth_failed'}`);
  }

  // Decode state
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as { userId: string };
    userId = decoded.userId;
    if (!userId) throw new Error('missing userId');
  } catch {
    return NextResponse.redirect(`${origin}/backup?error=invalid_state`);
  }

  // Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'token_exchange_failed';
    return NextResponse.redirect(`${origin}/backup?error=${encodeURIComponent(msg)}`);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const email = await getGoogleUserEmail(tokens.access_token);

  const admin = getSupabaseServiceRoleClient();

  // Upsert credentials
  await admin
    .from('zafirix_google_credentials')
    .upsert(
      {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_type: tokens.token_type ?? 'Bearer',
        expires_at: expiresAt,
        scope: tokens.scope ?? null,
        google_email: email || null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  // Audit log
  void admin.from('atlas_entity_events').insert({
    user_id: userId,
    entity_type: 'integration',
    entity_id: 'google_drive',
    event_type: 'google_drive_connected',
    payload: { email, scope: tokens.scope },
  });

  return NextResponse.redirect(`${origin}/backup?connected=google_drive`);
}
