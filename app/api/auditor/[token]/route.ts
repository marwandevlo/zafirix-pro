import { NextRequest, NextResponse } from 'next/server';
import {
  AuditorPassError,
  buildAuditorPortalPayload,
  recordAuditorAccess,
  validateAuditorPass,
} from '@/app/lib/atlas-auditor-pass-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? undefined;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();
  const view = (new URL(request.url).searchParams.get('view') ?? 'dashboard') as
    'dashboard' | 'journal' | 'ledger' | 'invoices' | 'payments' | 'bank' | 'full';

  try {
    const pass = await validateAuditorPass(admin, token);
    const payload = await buildAuditorPortalPayload(admin, pass, view);

    const actionMap: Record<string, 'portal_view' | 'view_journal' | 'view_ledger' | 'view_invoices'> = {
      dashboard: 'portal_view',
      journal: 'view_journal',
      ledger: 'view_ledger',
      invoices: 'view_invoices',
      full: 'portal_view',
    };

    await recordAuditorAccess(admin, pass, actionMap[view] ?? 'portal_view', {
      resource: view,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (e instanceof AuditorPassError) {
      const status = e.code === 'expired' ? 410 : e.code === 'forbidden' ? 403 : 404;
      return NextResponse.json({ error: e.code }, { status });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
