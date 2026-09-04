import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  queueSecurityAlertEmail,
  resolveAuthUserContact,
  type SecurityAlertKind,
} from '@/app/lib/email-transactional';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SECURITY_KINDS: readonly SecurityAlertKind[] = ['password_changed', 'profile_updated'];

function isSecurityKind(value: string): value is SecurityAlertKind {
  return (SECURITY_KINDS as readonly string[]).includes(value);
}

/**
 * POST /api/auth/notify-security
 * Queues a security alert to the authenticated user (never trusts a client-supplied recipient).
 */
export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.code }, { status: session.status });
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    changedFields?: unknown;
  } | null;
  const kindRaw = String(body?.kind ?? 'password_changed').trim().toLowerCase();
  if (!isSecurityKind(kindRaw)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }

  const changedFields = Array.isArray(body?.changedFields)
    ? body.changedFields.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : undefined;

  try {
    const admin = getSupabaseServiceRoleClient();
    const contact = await resolveAuthUserContact(admin, session.userId);
    if (!contact) {
      return NextResponse.json({ ok: true, queued: false });
    }
    queueSecurityAlertEmail({
      kind: kindRaw,
      to: contact.email,
      displayName: contact.displayName,
      userId: session.userId,
      changedFields,
    });
    return NextResponse.json({ ok: true, queued: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/auth/notify-security] failed', message);
    return NextResponse.json({ ok: true, queued: false });
  }
}
