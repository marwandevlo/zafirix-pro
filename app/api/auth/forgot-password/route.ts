import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { dispatchPasswordResetForEmail } from '@/app/lib/email-auth-dispatch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/auth/forgot-password
 * Sends a branded recovery email via Resend. Always returns ok when the email looks valid.
 */
export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = String(body?.email ?? '').trim();
  const result = await dispatchPasswordResetForEmail(email);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'invalid_email' ? 400 : 503 });
  }
  return NextResponse.json({ ok: true });
}
