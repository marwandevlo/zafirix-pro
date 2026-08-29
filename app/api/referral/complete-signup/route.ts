import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { ATLAS_REFERRAL_COOKIE, readReferralCodeFromCookieHeader } from '@/app/lib/atlas-referral-cookie';
import { attachReferralSafely } from '@/app/lib/atlas-referral-server';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'misconfigured' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabaseUser = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
  const user = authData?.user;
  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const code =
    normalizeReferralCode(body?.code ?? '') ||
    readReferralCodeFromCookieHeader(cookieStore.get(ATLAS_REFERRAL_COOKIE)?.value);
  if (!code) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'missing_code' });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const result = await attachReferralSafely(admin, user.id, code);
    if (!result.ok) {
      console.warn('[referral/complete-signup] attach skipped', { reason: result.reason, userId: user.id });
      return NextResponse.json({ ok: true, skipped: true, reason: result.reason });
    }
    return NextResponse.json({ ok: true, already: result.already });
  } catch (error) {
    console.error('[referral/complete-signup] non-blocking error', {
      userId: user.id,
      message: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ ok: true, skipped: true, error: 'server_error' });
  }
}
