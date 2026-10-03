import type { SupabaseClient } from '@supabase/supabase-js';

/** Keep aligned with `app/api/analytics/track/route.ts` allowlist. */
const ALLOWED = new Set([
  'view_landing',
  'click_signup',
  'signup_completed',
  'onboarding_started',
  'onboarding_completed',
  'view_pricing',
  'upgrade_clicked',
  'trial_banner_clicked',
  'manual_payment_requested',
  'referral_link_created',
  'referral_share_clicked',
  'referral_signup_started',
  'referral_signup_completed',
  'referral_reward_granted',
  'onboarding_first_company_created',
  'onboarding_first_client_created',
  'onboarding_first_invoice_created',
  'onboarding_tour_started',
  'onboarding_tour_completed',
  'onboarding_wizard_opened',
  'first_session_landed',
  'invoice_blocked_no_company',
  'first_invoice_started',
  'referral_progress',
  'reward_unlocked',
]);

/**
 * Inserts one row into `events` using service role client. Never throws.
 */
export async function recordServerAnalyticsEvent(
  admin: SupabaseClient,
  params: {
    userId: string | null;
    eventName: string;
    path?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const name = params.eventName.trim();
  if (!ALLOWED.has(name)) return;
  try {
    await admin.from('events').insert({
      user_id: params.userId,
      event_name: name,
      path: params.path?.slice(0, 512) ?? null,
      metadata: params.metadata && typeof params.metadata === 'object' ? params.metadata : null,
    });
  } catch (e) {
    console.warn('[server-analytics-event]', name, e);
  }
}
