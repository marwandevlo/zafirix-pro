import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { ATLAS_REFERRAL_COOKIE } from '@/app/lib/atlas-referral-cookie';
import { classifyTrafficSource, normalizeReferralCodeLabel } from '@/app/lib/atlas-traffic-source';
import { checkPaymentRateLimit } from '@/app/lib/payment-rate-limit';
import { runAfterResponse } from '@/app/lib/atlas-wait-until';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]?.trim() || '';
  return request.headers.get('x-real-ip')?.trim() || '';
}

function hashIp(ip: string): string | null {
  const trimmed = ip.trim();
  if (!trimmed) return null;
  const salt =
    process.env.ANALYTICS_IP_SALT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 12) ||
    'zafirix-analytics';
  return createHash('sha256').update(`${salt}:${trimmed}`).digest('hex').slice(0, 32);
}

function sanitizePath(raw: unknown): string {
  const path = typeof raw === 'string' ? raw.trim().slice(0, 512) : '';
  if (!path.startsWith('/')) return '';
  if (path.startsWith('/api') || path.startsWith('/admin') || path.startsWith('/_next')) return '';
  return path;
}

export async function POST(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const ip = clientIp(request);
    const rate = checkPaymentRateLimit(`analytics_pageview:${ip || 'unknown'}`);
    if (!rate.ok) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'rate_limited' });
    }

    const body = (await request.json().catch(() => ({}))) as {
      path?: string;
      referrer?: string;
      visitorId?: string;
      affiliateCode?: string;
    };

    const path = sanitizePath(body.path);
    if (!path) return NextResponse.json({ ok: true, skipped: true, reason: 'invalid_path' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'misconfigured' });
    }

    const cookieRef = request.cookies.get(ATLAS_REFERRAL_COOKIE)?.value;
    const affiliate = normalizeReferralCodeLabel(body.affiliateCode || cookieRef);
    const host = request.headers.get('host') ?? request.nextUrl.host;
    const referrer = classifyTrafficSource({
      referrerUrl: typeof body.referrer === 'string' ? body.referrer : '',
      affiliateCode: affiliate.replace(/^affiliate:/, ''),
      currentHost: host,
    });

    const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim().slice(0, 80) : '';

    const ipHash = hashIp(ip);
    runAfterResponse(
      (async () => {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error } = await admin.from('analytics_events').insert({
          path,
          referrer,
          user_id: null,
          ip_hash: ipHash,
          visitor_id: visitorId || null,
        });
        if (error) console.warn('[analytics/pageview] insert failed', error.message);
      })(),
    );

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.warn('[analytics/pageview] unexpected', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: true, skipped: true });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
