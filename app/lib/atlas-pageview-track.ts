'use client';

import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { ATLAS_REFERRAL_CONFIG } from '@/app/lib/atlas-referral-config';
import { sendTelemetry } from '@/app/lib/atlas-telemetry-client';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';

const SKIP_PREFIXES = ['/admin', '/api', '/auth', '/_next'];
const SKIP_EXACT = new Set(['/sw.js', '/manifest.json', '/favicon.ico']);
const MIN_INTERVAL_MS = 2500;
const VISITOR_KEY = 'atlas_funnel_anonymous_id';

let lastSent = { path: '', at: 0 };

function shouldSkipPath(path: string): boolean {
  if (!path || SKIP_EXACT.has(path)) return true;
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return true;
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY)?.trim();
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function pendingAffiliateCode(): string {
  try {
    const q = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref'));
    if (q) return q;
    return normalizeReferralCode(sessionStorage.getItem(ATLAS_REFERRAL_CONFIG.pendingCodeStorageKey));
  } catch {
    return '';
  }
}

/**
 * Fire-and-forget page view. Never throws, never awaits auth, uses keepalive.
 */
export function trackPageView(pathOverride?: string): void {
  if (typeof window === 'undefined') return;
  if (!isAtlasSupabaseDataEnabled()) return;

  const path = (pathOverride || window.location.pathname || '').trim().slice(0, 512);
  if (shouldSkipPath(path)) return;

  const now = Date.now();
  if (lastSent.path === path && now - lastSent.at < MIN_INTERVAL_MS) return;
  lastSent = { path, at: now };

  const payload = {
    path,
    referrer: typeof document !== 'undefined' ? String(document.referrer || '').slice(0, 1024) : '',
    visitorId: visitorId(),
    affiliateCode: pendingAffiliateCode(),
  };

  sendTelemetry('/api/analytics/pageview', payload);
}
