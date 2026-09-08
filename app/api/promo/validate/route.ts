import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { checkPaymentRateLimit } from '@/app/lib/payment-rate-limit';
import { validateAffiliatePromoCode } from '@/app/lib/atlas-promo-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

function requireBearer(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function promoErrorMessage(reason: string): string {
  switch (reason) {
    case 'invalid_code':
      return 'Code promo invalide ou expiré.';
    case 'inactive_affiliate':
      return 'Ce code promo n’est pas associé à un affilié actif.';
    case 'self_referral':
      return 'Vous ne pouvez pas utiliser votre propre code promo.';
    case 'invalid_amount':
      return 'Montant invalide pour appliquer la réduction.';
    default:
      return 'Code promo invalide.';
  }
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ valid: false, error: 'not_enabled' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
  const rate = checkPaymentRateLimit(`promo:${ip}`);
  if (!rate.ok) {
    return NextResponse.json(
      { valid: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => null)) as null | {
    code?: string;
    baseAmountMad?: number;
  };
  const code = (body?.code ?? '').trim();
  const baseAmountMad =
    typeof body?.baseAmountMad === 'number' && Number.isFinite(body.baseAmountMad)
      ? body.baseAmountMad
      : undefined;

  if (!code) {
    return NextResponse.json({ valid: false, error: 'missing_code' }, { status: 400 });
  }

  let referredUserId: string | null = null;
  const token = requireBearer(request);
  if (token) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (supabaseUrl && supabaseAnonKey) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: auth } = await userClient.auth.getUser();
      referredUserId = auth.user?.id ?? null;
    }
  }

  let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ valid: false, error: 'server_misconfigured', message: msg }, { status: 503 });
  }

  const result = await validateAffiliatePromoCode(admin, code, {
    referredUserId,
    baseAmountMad: baseAmountMad ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({
      valid: false,
      error: result.reason,
      message: promoErrorMessage(result.reason),
    });
  }

  const successMessage = result.attributionOnly
    ? 'Code promo appliqué. Votre abonnement sera attribué à l’affilié correspondant.'
    : `Code promo appliqué : −${result.discountPercent}% (−${result.discountAmount.toLocaleString('fr-MA')} MAD).`;

  return NextResponse.json({
    valid: true,
    code: result.code,
    discountPercent: result.discountPercent,
    discountAmount: result.discountAmount,
    finalAmount: result.finalAmount,
    attributionOnly: result.attributionOnly,
    message: successMessage,
    messageAr: result.attributionOnly
      ? 'تم تطبيق الرمز. سيتم ربط اشتراكك بالشريك المعني.'
      : `تم تطبيق الرمز: خصم ${result.discountPercent}٪ (−${result.discountAmount.toLocaleString('fr-MA')} درهم).`,
  });
}
