import { ATLAS_REFERRAL_CONFIG } from '@/app/lib/atlas-referral-config';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';
import { sendTelemetry } from '@/app/lib/atlas-telemetry-client';
import { normalizeReferralCode as normalizeReferralCodeUtil } from '@/app/lib/atlas-referral-utils';

export const ATLAS_REFERRAL_PENDING_KEY = ATLAS_REFERRAL_CONFIG.pendingCodeStorageKey;

export function normalizeReferralCode(raw: string | null | undefined): string {
  return normalizeReferralCodeUtil(raw);
}

export function storePendingReferralCode(code: string): void {
  if (typeof window === 'undefined') return;
  const n = normalizeReferralCode(code);
  if (!n) return;
  try {
    sessionStorage.setItem(ATLAS_REFERRAL_PENDING_KEY, n);
  } catch {
    // ignore
  }
}

export function readPendingReferralCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeReferralCode(sessionStorage.getItem(ATLAS_REFERRAL_PENDING_KEY));
  } catch {
    return '';
  }
}

export function clearPendingReferralCode(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ATLAS_REFERRAL_PENDING_KEY);
  } catch {
    // ignore
  }
}

export function buildSignupReferralLink(origin: string, code: string): string {
  const base = (origin || '').replace(/\/$/, '') || '';
  const c = normalizeReferralCode(code);
  if (!base || !c) return '';
  return `${base}/register?ref=${encodeURIComponent(c)}`;
}

/** Landing + cookie capture: `https://zafirixpro.com/?ref=CODE`. */
export function buildPublicReferralLink(origin: string, code: string): string {
  const base = (origin || '').replace(/\/$/, '') || '';
  const c = normalizeReferralCode(code);
  if (!base || !c) return '';
  return `${base}/?ref=${encodeURIComponent(c)}`;
}

/** Persist `?ref=` from the current URL (sessionStorage). Safe no-op on the server. */
export function captureReferralFromWindow(): string {
  if (typeof window === 'undefined') return '';
  try {
    const code = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref'));
    if (code) storePendingReferralCode(code);
    return code || readPendingReferralCode();
  } catch {
    return '';
  }
}

/** One click log per tab. Never throws. */
export function logReferralLandingClick(code: string): void {
  if (typeof window === 'undefined') return;
  const n = normalizeReferralCode(code);
  if (!n) return;
  try {
    if (sessionStorage.getItem('atlas_ref_signup_started') === '1') return;
    sessionStorage.setItem('atlas_ref_signup_started', '1');
  } catch {
    // continue to fire click
  }
  sendTelemetry('/api/referral/click', { code: n });
}

/** Await referral attach after trial claim so welcome bonus can extend the new trial row. */
export async function awaitCompleteReferralSignupWithSession(): Promise<void> {
  if (ATLAS_INCIDENT_HOTFIX_GROWTH || !isAtlasSupabaseDataEnabled()) return;
  const code = readPendingReferralCode();
  if (!code) return;
  try {
    const { supabase } = await import('@/app/lib/supabase');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/referral/complete-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; skipped?: boolean };
    if (res.ok && json?.ok && !json.skipped) {
      clearPendingReferralCode();
      return;
    }
    if (json?.reason === 'self_referral' || json?.reason === 'invalid_code') clearPendingReferralCode();
  } catch {
    // non-blocking
  }
}

/**
 * Fire-and-forget: attach pending referral after auth. Never throws; ignores when Supabase off.
 */
export function flushPendingReferralSignup(accessToken?: string | null): void {
  if (ATLAS_INCIDENT_HOTFIX_GROWTH || !isAtlasSupabaseDataEnabled()) return;
  const code = readPendingReferralCode();
  if (!code) return;

  void (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const { supabase } = await import('@/app/lib/supabase');
      if (!accessToken) {
        const { data } = await supabase.auth.getSession();
        const t = data.session?.access_token;
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      if (!headers.Authorization) return;

      const res = await fetch('/api/referral/complete-signup', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
        keepalive: true,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: boolean; reason?: string };
      if (res.ok && json?.ok && !json.skipped) clearPendingReferralCode();
      else if (json?.reason === 'self_referral' || json?.reason === 'invalid_code') clearPendingReferralCode();
    } catch {
      // non-blocking
    }
  })();
}

export function referralWhatsAppMessage(link: string): string {
  const safe = link.trim();
  return `جرب ZAFIRIX PRO مجاناً 7 أيام باش تسهل المحاسبة والفواتير والضرائب ديالك في المغرب: ${safe}`;
}

/** Moroccan Darija + French for higher conversion on WhatsApp forwards. */
export function buildReferralShareTextBilingual(link: string): string {
  const safe = link.trim();
  return [
    `جرّب ZAFIRIX PRO دابا باش تسهل المحاسبة، الفواتير والضرائب ديالك فالمغرب — 7 أيام مجانية، بلا كارت بانكير.`,
    ``,
    `Essaie ZAFIRIX PRO : compta, factures et fiscalité au Maroc — 7 jours gratuits, sans carte bancaire.`,
    ``,
    `Lien · الرابط : ${safe}`,
  ].join('\n');
}

export function openWhatsAppReferralShareText(text: string): void {
  if (typeof window === 'undefined') return;
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openWhatsAppReferralShare(link: string): void {
  openWhatsAppReferralShareText(buildReferralShareTextBilingual(link));
}
