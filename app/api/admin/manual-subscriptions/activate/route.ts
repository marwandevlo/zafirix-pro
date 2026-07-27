import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { sendEmailViaResend } from '@/app/lib/atlas-email-resend';
import { buildPaidSubscriptionActivatedEmailHtml } from '@/app/lib/atlas-email-templates';
import { getWhatsAppOpsPhoneDigits, sendWhatsAppMessage } from '@/app/lib/whatsapp-service';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { syncProfileEntitlementFromAtlas } from '@/app/lib/atlas-subscription-sync';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logAtlasAdminAction } from '@/app/lib/admin/atlas-admin-audit';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((v) => Number.parseInt(v, 10));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.trunc(days)));
  return todayYmd(dt);
}

/**
 * Activate a manual checkout request from public.atlas_payment_requests
 * (created by /api/payments/manual-request on /payment).
 */
export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as null | { id?: string };
  const id = String(body?.id ?? '').trim();
  if (!id || !isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[manual-subscriptions/activate] service_role_missing', { message: msg });
    return NextResponse.json({ error: 'server_misconfigured', message: msg }, { status: 503 });
  }

  const { data: row, error: readErr } = await admin
    .from('atlas_payment_requests')
    .select('id, user_id, plan_id, billing_period, status, metadata, amount_mad, manual_provider')
    .eq('id', id)
    .maybeSingle();

  if (readErr) {
    console.error('[manual-subscriptions/activate] read_failed', {
      code: (readErr as { code?: string }).code ?? null,
      message: readErr.message,
    });
    return NextResponse.json({ error: 'db_error', message: readErr.message }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const status = String((row as { status?: string }).status ?? '').toLowerCase();
  if (status !== 'pending') {
    return NextResponse.json({ error: 'not_pending_or_already_processed', status }, { status: 400 });
  }

  const planId = String((row as { plan_id?: string }).plan_id ?? '').trim();
  const plan = getAtlasPlanById(planId);
  if (!plan) {
    return NextResponse.json({ error: 'invalid_plan', planId }, { status: 400 });
  }

  const userId = String((row as { user_id?: string }).user_id ?? '');
  if (!userId) return NextResponse.json({ error: 'invalid_user' }, { status: 400 });

  const start = todayYmd();
  const end =
    plan.billingPeriod === 'trial' ? addDaysYmd(start, plan.durationDays ?? 7) : addDaysYmd(start, 365);

  const { data: updatedRows, error: markPaidErr } = await admin
    .from('atlas_payment_requests')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');

  if (markPaidErr || !updatedRows?.length) {
    console.error('[manual-subscriptions/activate] mark_paid_failed', {
      code: (markPaidErr as { code?: string } | null)?.code ?? null,
      message: markPaidErr?.message ?? 'no_rows',
    });
    return NextResponse.json(
      { error: 'not_pending_or_already_processed', message: markPaidErr?.message },
      { status: 400 },
    );
  }

  const meta = (row as { metadata?: Record<string, unknown> | null }).metadata ?? {};
  const { error: insSub } = await admin.from('atlas_subscriptions').insert({
    user_id: userId,
    plan_id: plan.id,
    status: 'active',
    start_date: start,
    end_date: end,
    payment_request_id: id,
    metadata: {
      source: 'manual_payment_checkout',
      manual_provider: (row as { manual_provider?: string | null }).manual_provider ?? null,
      amount_mad: (row as { amount_mad?: number | null }).amount_mad ?? null,
      ...meta,
    },
  });

  if (insSub) {
    console.error('[manual-subscriptions/activate] atlas_subscription_insert_failed', {
      code: (insSub as { code?: string }).code ?? null,
      message: insSub.message,
    });
    await admin
      .from('atlas_payment_requests')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id);
    return NextResponse.json({ error: 'atlas_subscription_failed', message: insSub.message }, { status: 500 });
  }

  await admin
    .from('atlas_subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('plan_id', 'free-trial')
    .eq('status', 'trial');

  const { data: userWrap } = await admin.auth.admin.getUserById(userId);
  const uemail = userWrap.user?.email?.trim();
  if (uemail) {
    const mail = buildPaidSubscriptionActivatedEmailHtml(plan.name, end);
    void sendEmailViaResend({ to: uemail, subject: mail.subject, html: mail.html });
  }

  const waText = `ZAFIRIX PRO — votre abonnement est activé 🚀\nForfait: ${plan.name}\nValable jusqu’au ${end}.`;
  void sendWhatsAppMessage(getWhatsAppOpsPhoneDigits(), `${waText}\nCompte: ${uemail ?? userId}`);

  const sync = await syncProfileEntitlementFromAtlas(admin, userId);
  if (!sync.ok) console.warn('[manual-subscriptions/activate] profile_sync', sync.error);

  await logAtlasAdminAction({
    actorUserId: guard.adminUserId,
    action: 'manual_payment_activate',
    targetType: 'atlas_payment_requests',
    targetId: id,
    metadata: { user_id: userId, plan_id: plan.id, start, end },
  });

  return NextResponse.json({ ok: true, startDate: start, endDate: end });
}
