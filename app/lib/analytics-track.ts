import { appendLocalFunnelEvent } from '@/app/lib/atlas-funnel-local-buffer';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';

export const ANALYTICS_EVENT_NAMES = [
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
  'onboarding_wizard_step',
  'onboarding_wizard_abandoned',
  'onboarding_tour_completed',
  'onboarding_first_value',
  'onboarding_checklist_progress',
  'feedback_submitted',
  'referral_progress',
  'reward_unlocked',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const ALLOWED = new Set<string>(ANALYTICS_EVENT_NAMES);

function getOrCreateAnonymousId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'atlas_funnel_anonymous_id';
  let id = localStorage.getItem(key)?.trim();
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function currentPath(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.location.pathname || '';
  } catch {
    return '';
  }
}

/**
 * Fire-and-forget analytics into Supabase `events` (path + metadata stored server-side).
 * Never throws. In development, may fall back to a local funnel buffer when Supabase is off or the request fails.
 * In production, failures do not write to localStorage (no silent “fake” persistence).
 */
export function trackEvent(eventName: AnalyticsEventName, metadata: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  if (!ALLOWED.has(eventName)) return;
  if (
    ATLAS_INCIDENT_HOTFIX_GROWTH &&
    (eventName === 'manual_payment_requested' ||
      eventName.startsWith('referral_') ||
      eventName === 'reward_unlocked')
  ) {
    return;
  }

  const anonymousId = getOrCreateAnonymousId();
  const path = currentPath();
  const payload = { event: eventName, anonymousId, path, metadata };

  const fallbackLocal = () => {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[analytics] Supabase persist unavailable; local funnel buffer disabled in production');
      return;
    }
    appendLocalFunnelEvent({
      event_name: eventName,
      anonymous_id: anonymousId || null,
      metadata: { ...metadata, path },
      created_at: new Date().toISOString(),
    });
  };

  if (!isAtlasSupabaseDataEnabled()) {
    fallbackLocal();
    return;
  }

  void (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const { supabase } = await import('@/app/lib/supabase');
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        // ignore — anonymous tracking still works
      }

      const res = await fetch('/api/analytics/track', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (!res.ok) fallbackLocal();
    } catch {
      fallbackLocal();
    }
  })();
}
