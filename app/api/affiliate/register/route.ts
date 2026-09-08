import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { registerAffiliateAccount } from '@/app/lib/atlas-affiliate-registration-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RegisterBody = {
  fullName?: string;
  email?: string;
  password?: string;
};

const REGISTER_WINDOW_MS = 60_000;
const REGISTER_MAX_PER_IP = 8;
const ipBuckets = new Map<string, { resetAt: number; count: number }>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function checkRegisterRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    ipBuckets.set(ip, { resetAt: now + REGISTER_WINDOW_MS, count: 1 });
    return { ok: true };
  }
  if (bucket.count >= REGISTER_MAX_PER_IP) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true };
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false, error: 'not_enabled', message: 'Supabase not enabled' }, { status: 400 });
  }

  const ip = clientIp(request);
  const rate = checkRegisterRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        code: 'rate_limited',
        message: 'Trop de tentatives. Réessayez dans quelques instants.',
        retryAfterSec: rate.retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json', message: 'Corps JSON invalide.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseServiceRoleClient();
    const result = await registerAffiliateAccount(admin, {
      fullName: String(body.fullName ?? ''),
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
    });

    if (!result.ok) {
      const status =
        result.code === 'email_exists'
          ? 409
          : result.code === 'rate_limited'
            ? 429
            : result.code === 'invalid_email' || result.code === 'weak_password' || result.code === 'full_name_required'
              ? 400
              : 500;
      return NextResponse.json(
        { ok: false, error: result.code, code: result.code, message: result.message },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      userId: result.userId,
      email: result.email,
      referralCode: result.referralCode,
      referralLink: result.referralLink,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'server_error', code: 'server_error', message: 'Erreur serveur.' },
      { status: 500 },
    );
  }
}
