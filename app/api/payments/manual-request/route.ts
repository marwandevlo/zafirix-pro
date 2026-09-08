import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';
import { getCompanyAddonById } from '@/app/lib/atlas-company-addons';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { checkPaymentRateLimit } from '@/app/lib/payment-rate-limit';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { MANUAL_PAYMENT_FALLBACK_EMAIL } from '@/app/lib/atlas-manual-subscription';
import { attachReferralSafely } from '@/app/lib/atlas-referral-server';
import { validateAffiliatePromoCode } from '@/app/lib/atlas-promo-server';

type ManualProvider = 'cashplus' | 'wafacash' | 'western_union';

type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function requireBearer(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function isMissingPaymentRequestsTable(error: DbErrorLike): boolean {
  const code = String(error.code ?? '');
  const message = String(error.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes("could not find the table 'public.atlas_payment_requests'") ||
    message.includes('relation "public.atlas_payment_requests" does not exist') ||
    (message.includes('atlas_payment_requests') && message.includes('does not exist'))
  );
}

export async function POST(request: NextRequest) {
  if (ATLAS_INCIDENT_HOTFIX_GROWTH) {
    console.warn('[api/payments/manual-request] blocked by ATLAS_INCIDENT_HOTFIX_GROWTH');
    return NextResponse.json(
      {
        error: 'temporarily_unavailable',
        message: 'Les paiements manuels sont temporairement désactivés (incident hotfix).',
      },
      { status: 503 },
    );
  }
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const token = requireBearer(request);
  if (!token) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[api/payments/manual-request] missing supabase public env');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) {
    console.warn('[api/payments/manual-request] auth_required', { message: authError?.message });
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const rate = checkPaymentRateLimit(`payreq:${auth.user.id}`);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => null)) as null | {
    planId?: string;
    addonId?: string;
    provider?: ManualProvider;
    promoCode?: string;
  };
  const planId = (body?.planId ?? '').trim();
  const addonId = (body?.addonId ?? '').trim();
  const provider = body?.provider;
  const promoCodeRaw = (body?.promoCode ?? '').trim();

  const addon = addonId ? getCompanyAddonById(addonId) : undefined;
  const plan = planId ? getAtlasPlanById(planId) : undefined;

  if (addonId && !addon) return NextResponse.json({ error: 'invalid_addon' }, { status: 400 });
  if (!addonId && (!plan || !planId)) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  if (addonId && planId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (!provider || !['cashplus', 'wafacash', 'western_union'].includes(provider)) {
    return NextResponse.json({ error: 'invalid_provider' }, { status: 400 });
  }

  let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/payments/manual-request] service_role_missing', { message: msg });
    return NextResponse.json({ error: 'service_role_missing', message: msg }, { status: 500 });
  }

  const userEmail =
    typeof auth.user.email === 'string' && auth.user.email.trim()
      ? auth.user.email.trim()
      : MANUAL_PAYMENT_FALLBACK_EMAIL;

  const baseAmountMad = addon ? addon.priceMadYear : plan!.price;
  let promoMeta: Record<string, unknown> = {};
  let chargedAmountMad = baseAmountMad;

  if (promoCodeRaw) {
    const promo = await validateAffiliatePromoCode(admin, promoCodeRaw, {
      referredUserId: auth.user.id,
      baseAmountMad,
    });
    if (!promo.ok) {
      const messages: Record<string, string> = {
        invalid_code: 'Code promo invalide ou expiré.',
        inactive_affiliate: 'Ce code promo n’est pas associé à un affilié actif.',
        self_referral: 'Vous ne pouvez pas utiliser votre propre code promo.',
        invalid_amount: 'Montant invalide pour appliquer la réduction.',
      };
      return NextResponse.json(
        { error: 'invalid_promo', message: messages[promo.reason] ?? 'Code promo invalide.' },
        { status: 400 },
      );
    }

    chargedAmountMad = promo.finalAmount;
    promoMeta = {
      promo_code: promo.code,
      promo_referrer_user_id: promo.referrerUserId,
      promo_discount_percent: promo.discountPercent,
      promo_discount_mad: promo.discountAmount,
      promo_base_amount_mad: baseAmountMad,
      promo_attribution_only: promo.attributionOnly,
    };

    await attachReferralSafely(admin, auth.user.id, promo.code);
  }

  const insertRow = addon
    ? {
        user_id: auth.user.id,
        plan_id: 'pro',
        amount_mad: chargedAmountMad,
        currency: 'MAD' as const,
        billing_period: 'year',
        payment_method: 'manual' as const,
        manual_provider: provider,
        status: 'pending' as const,
        metadata: {
          kind: 'company_slot_addon',
          addonId: addon.id,
          extraSlots: addon.extraSlots,
          source: 'payment_checkout',
          user_email: userEmail,
          email: userEmail,
          ...promoMeta,
        },
      }
    : {
        user_id: auth.user.id,
        plan_id: plan!.id,
        amount_mad: chargedAmountMad,
        currency: plan!.currency,
        billing_period: plan!.billingPeriod,
        payment_method: 'manual' as const,
        manual_provider: provider,
        status: 'pending' as const,
        metadata: {
          source: 'payment_checkout',
          user_email: userEmail,
          email: userEmail,
          ...promoMeta,
        },
      };

  const { data, error } = await admin
    .from('atlas_payment_requests')
    .insert(insertRow)
    .select('id')
    .single();

  if (error || !data) {
    const dbError = (error ?? {}) as DbErrorLike;
    const missing = isMissingPaymentRequestsTable(dbError);
    console.error('[api/payments/manual-request] insert_failed', {
      code: dbError.code ?? null,
      message: dbError.message ?? null,
      details: dbError.details ?? null,
      hint: dbError.hint ?? null,
      missingTable: missing,
      userId: auth.user.id,
      planId: insertRow.plan_id,
    });
    return NextResponse.json(
      {
        error: missing ? 'payment_requests_table_missing' : 'db_error',
        message: dbError.message ?? 'insert_failed',
        code: dbError.code ?? null,
        hint: missing
          ? 'Run supabase/migrations/20260727100000_ensure_atlas_payment_requests.sql in the Supabase SQL Editor.'
          : (dbError.hint ?? null),
      },
      { status: 500 },
    );
  }

  console.info('[api/payments/manual-request] created', {
    id: data.id,
    userId: auth.user.id,
    planId: insertRow.plan_id,
    provider,
  });

  return NextResponse.json({ id: data.id });
}
