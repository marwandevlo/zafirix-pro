import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { checkPaymentRateLimit } from '@/app/lib/payment-rate-limit';
import { insertReferralClick, resolveReferrerUserId } from '@/app/lib/atlas-referral-server';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';
import { runAfterResponse } from '@/app/lib/atlas-wait-until';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function persistClick(code: string, supabaseUrl: string, serviceRoleKey: string): Promise<void> {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const referrerId = await resolveReferrerUserId(admin, code);
  if (!referrerId) return;
  await insertReferralClick(admin, referrerId, code);
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const ip = clientIp(request);
  const rate = checkPaymentRateLimit(`referral_click:${ip}`);
  if (!rate.ok) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'rate_limited' }, { status: 202 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'misconfigured' }, { status: 202 });
  }

  const body = (await request.json().catch(() => null)) as null | { code?: string };
  const code = normalizeReferralCode(body?.code ?? '');
  if (!code) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  runAfterResponse(
    persistClick(code, supabaseUrl, serviceRoleKey).catch((error: unknown) => {
      console.warn('[referral/click] persist failed', error instanceof Error ? error.message : error);
    }),
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
