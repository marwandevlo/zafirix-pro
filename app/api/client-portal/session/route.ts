import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getPortalBaseUrl, getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { resolveClientPortalSession } from '@/app/lib/atlas-client-portal';
import { buildClientPortalPath } from '@/app/lib/atlas-client-portal-links';
import { isClientPortalBridgeEnabled, clientPortalDemoCode } from '@/app/lib/atlas-sprint0-flags';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST — validate client access code and return linked company (no upload). */
export async function POST(request: NextRequest) {
  if (!isClientPortalBridgeEnabled()) {
    return NextResponse.json({ error: 'portal_disabled' }, { status: 403 });
  }
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { accessCode?: string };
  const accessCode = String(body.accessCode ?? '').trim();
  if (!accessCode) {
    return NextResponse.json({ error: 'access_code_required' }, { status: 400 });
  }

  try {
    const admin = getSupabaseServiceRoleClient();
    const session = await resolveClientPortalSession(admin, accessCode);
    if (!session) {
      return NextResponse.json({ error: 'invalid_access_code', message: 'Code d\'accès invalide.' }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      session: {
        companyId: session.companyId,
        companyName: session.companyName,
      },
      demoCodeHint: process.env.NODE_ENV === 'development' ? clientPortalDemoCode() : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'session_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET — portal activation status (health check). */
export async function GET() {
  const demoCode = clientPortalDemoCode();
  const portalPath = buildClientPortalPath(demoCode);
  return NextResponse.json({
    enabled: isClientPortalBridgeEnabled(),
    backend: atlasDataBackend(),
    appOrigin: getPublicAppUrl(),
    portalOrigin: getPortalBaseUrl(),
    portalEntryPath: '/portal',
    demoPortalPath: process.env.NODE_ENV === 'development' ? portalPath : undefined,
    demoCode: process.env.NODE_ENV === 'development' ? demoCode : undefined,
  });
}
