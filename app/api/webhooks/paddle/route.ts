import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { verifyPaddleBillingSignature } from '@/app/lib/paddle-webhook';
import { addDaysYmd, todayYmd } from '@/app/lib/atlas-dates';
import {
  cancelPaddleAtlasSubscription,
  paddleSubscriptionWindowFromPayload,
  upsertPaddleAtlasSubscription,
} from '@/app/lib/atlas-subscription-sync';
import {
  creditAffiliateCommissionOnPayment,
  resolvePaidSubscriptionAmount,
} from '@/app/lib/atlas-affiliate-commission';

export const dynamic = 'force-dynamic';

/**
 * Paddle Billing webhooks — verifies `Paddle-Signature` when `PADDLE_WEBHOOK_SECRET` is set.
 * Extend `custom_data` from Paddle checkout (user_id, plan_id, email) to sync `subscriptions`.
 */
export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const rawBody = await request.text();
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim() ?? '';
  const sig = request.headers.get('paddle-signature') ?? request.headers.get('Paddle-Signature');

  if (process.env.NODE_ENV === 'production' && !secret) {
    console.error('[paddle:webhook] PADDLE_WEBHOOK_SECRET is required in production');
    return NextResponse.json({ ok: false, error: 'webhook_secret_required' }, { status: 503 });
  }

  if (!secret) {
    console.warn('[paddle:webhook] PADDLE_WEBHOOK_SECRET unset — signature verification skipped (non-production only)');
  } else if (!verifyPaddleBillingSignature(rawBody, sig, secret)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 400 });
  }

  let payload: { event_type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const eventType = String(payload.event_type ?? '');
  console.info('[paddle:webhook]', eventType);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const data = payload.data ?? {};
  const subscriptionId = typeof data.id === 'string' ? data.id : String(data.id ?? '');
  const customData = (data.custom_data ?? {}) as Record<string, unknown>;
  const userId = typeof customData.user_id === 'string' ? customData.user_id : '';
  const planId = typeof customData.plan_id === 'string' ? customData.plan_id : '';

  if (eventType === 'subscription.canceled' && subscriptionId) {
    await admin
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('paddle_subscription_id', subscriptionId);
    const c = await cancelPaddleAtlasSubscription({ admin, paddleSubscriptionId: subscriptionId });
    if (!c.ok) console.warn('[paddle:webhook] atlas_cancel', c.error);
  }

  if (
    (eventType === 'subscription.created' || eventType === 'subscription.activated' || eventType === 'subscription.updated') &&
    subscriptionId &&
    userId &&
    planId
  ) {
    const email = typeof customData.email === 'string' ? customData.email : null;
    const { error } = await admin.from('subscriptions').upsert(
      {
        user_id: userId,
        user_email: email,
        plan: planId,
        status: 'active',
        payment_method: 'paddle',
        paddle_subscription_id: subscriptionId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'paddle_subscription_id' },
    );
    if (error) console.warn('[paddle:webhook] upsert', error.message);

    const win = paddleSubscriptionWindowFromPayload(data);
    const startYmd = win?.startYmd ?? todayYmd();
    const endYmd = win?.endYmd ?? addDaysYmd(startYmd, 365);
    const atlas = await upsertPaddleAtlasSubscription({
      admin,
      userId,
      planId,
      paddleSubscriptionId: subscriptionId,
      startYmd,
      endYmd,
    });
    if (!atlas.ok) console.warn('[paddle:webhook] atlas_entitlement', atlas.error);

    try {
      const paid = resolvePaidSubscriptionAmount({ paddleData: data, planId });
      const commission = await creditAffiliateCommissionOnPayment({
        admin,
        referredUserId: userId,
        source: 'paddle',
        sourceRef: `sub:${subscriptionId}`,
        paymentAmount: paid.amount,
        currency: paid.currency,
        planId,
        metadata: { event_type: eventType, paddle_subscription_id: subscriptionId },
      });
      if (!commission.ok) {
        console.warn('[paddle:webhook] affiliate_commission_failed', commission.error);
      } else if (commission.credited) {
        console.info('[paddle:webhook] affiliate_commission', {
          userId,
          amount: commission.commissionAmount,
        });
      }
    } catch (error) {
      console.error('[paddle:webhook] affiliate_commission unexpected', {
        message: error instanceof Error ? error.message : error,
      });
    }
  }

  if (eventType === 'transaction.completed') {
    try {
      const txnCustom = (data.custom_data ?? customData) as Record<string, unknown>;
      const txnUserId = typeof txnCustom.user_id === 'string' ? txnCustom.user_id : userId;
      const txnPlanId = typeof txnCustom.plan_id === 'string' ? txnCustom.plan_id : planId;
      const txnSubId =
        (typeof data.subscription_id === 'string' && data.subscription_id) ||
        subscriptionId ||
        (typeof data.id === 'string' ? data.id : '');
      if (txnUserId && txnSubId) {
        const paid = resolvePaidSubscriptionAmount({ paddleData: data, planId: txnPlanId });
        const commission = await creditAffiliateCommissionOnPayment({
          admin,
          referredUserId: txnUserId,
          source: 'paddle',
          sourceRef: `sub:${txnSubId}`,
          paymentAmount: paid.amount,
          currency: paid.currency,
          planId: txnPlanId,
          metadata: { event_type: eventType, paddle_transaction_id: data.id ?? null },
        });
        if (!commission.ok) {
          console.warn('[paddle:webhook] affiliate_commission_failed', commission.error);
        }
      }
    } catch (error) {
      console.error('[paddle:webhook] transaction.completed affiliate unexpected', {
        message: error instanceof Error ? error.message : error,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
