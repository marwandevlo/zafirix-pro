/**
 * Client portal share links — production-safe URLs for invoice upload & tracking.
 */

import {
  absoluteUrl,
  getPortalBaseUrl,
  isDedicatedPortalHost,
} from '@/app/lib/atlas-app-url';

/** URL-safe portal access code (alphanumeric + hyphen, max 32). */
export function normalizePortalAccessCode(raw: string): string | null {
  const code = raw.trim();
  if (!code || code.length > 32) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return null;
  return code;
}

/** Path segment for portal entry (subdomain uses /{code}, main app uses /portal/{code}). */
export function buildClientPortalPath(companyCode: string): string | null {
  const code = normalizePortalAccessCode(companyCode);
  if (!code) return null;
  if (isDedicatedPortalHost()) return `/${encodeURIComponent(code)}`;
  return `/portal/${encodeURIComponent(code)}`;
}

/** Full shareable URL for clients (WhatsApp, email, SMS). */
export function buildClientPortalUrl(companyCode: string): string | null {
  const path = buildClientPortalPath(companyCode);
  if (!path) return null;
  return absoluteUrl(path, getPortalBaseUrl());
}

/** Parse code from /portal/[code] or dedicated-host /[code]. */
export function parseClientPortalCodeFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'portal' && segments[1]) {
    return normalizePortalAccessCode(decodeURIComponent(segments[1]));
  }
  if (isDedicatedPortalHost() && segments.length === 1) {
    return normalizePortalAccessCode(decodeURIComponent(segments[0]));
  }
  return null;
}

/** Human-readable label for accountant UI copy buttons. */
export function formatClientPortalLinkLabel(companyCode: string): string {
  const url = buildClientPortalUrl(companyCode);
  return url ?? buildClientPortalPath(companyCode) ?? `/portal/${companyCode}`;
}
