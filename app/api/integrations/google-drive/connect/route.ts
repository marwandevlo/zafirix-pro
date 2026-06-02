/**
 * GET /api/integrations/google-drive/connect
 * Redirects the authenticated user to Google's OAuth2 consent screen.
 * Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { buildGoogleAuthUrl, isGoogleDriveConfigured } from '@/app/lib/atlas-google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isGoogleDriveConfigured()) {
    const callbackUrl = `${request.nextUrl.origin}/backup?error=google_not_configured`;
    return NextResponse.redirect(callbackUrl);
  }

  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.redirect(`${request.nextUrl.origin}/login`);
  }

  // State encodes the user ID and origin for CSRF + redirect
  const state = Buffer.from(JSON.stringify({ userId, origin: request.nextUrl.origin })).toString('base64url');
  const authUrl = buildGoogleAuthUrl(state);

  return NextResponse.redirect(authUrl);
}
