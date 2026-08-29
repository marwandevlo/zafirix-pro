/**
 * Canonical public URLs for Zafirix Pro (emails, shared links, OAuth, metadata).
 *
 * Production never emits `*.vercel.app`. Custom domain is always https://zafirixpro.com.
 * Reads NEXT_PUBLIC_SITE_URL first, then NEXT_PUBLIC_APP_URL, then the production default.
 */

export const ATLAS_PRODUCTION_HOST = 'zafirixpro.com';
export const ATLAS_PRODUCTION_ORIGIN = `https://${ATLAS_PRODUCTION_HOST}`;

function trimOrigin(value: string | undefined | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.replace(/\/$/, '');
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

/** Reject Vercel preview hosts and fold www → apex. */
export function normalizePublicOrigin(raw: string | undefined | null): string | null {
  const trimmed = trimOrigin(raw);
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase();
    if (host.endsWith('.vercel.app')) return ATLAS_PRODUCTION_ORIGIN;
    if (host === ATLAS_PRODUCTION_HOST || host === `www.${ATLAS_PRODUCTION_HOST}`) {
      return ATLAS_PRODUCTION_ORIGIN;
    }
    if (host === 'localhost' || host.endsWith('.localhost')) {
      return `${url.protocol}//${url.host}`.replace(/\/$/, '');
    }
    return `${url.protocol}//${url.host}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Primary app origin (dashboard, auth, emails, Open Graph, sitemaps). */
export function getPublicAppUrl(): string {
  const fromSite = normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromSite) return fromSite;

  const fromApp = normalizePublicOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (fromApp) return fromApp;

  if (isProductionRuntime()) return ATLAS_PRODUCTION_ORIGIN;

  if (typeof window !== 'undefined' && window.location?.origin) {
    const live = normalizePublicOrigin(window.location.origin);
    if (live) return live;
  }

  return 'http://localhost:3000';
}

export function getMetadataBaseUrl(): URL {
  return new URL(`${getPublicAppUrl()}/`);
}

/** Dedicated client portal origin (e.g. https://portal.zafirixpro.ma). Falls back to app URL. */
export function getPortalBaseUrl(): string {
  return normalizePublicOrigin(process.env.NEXT_PUBLIC_PORTAL_URL) ?? getPublicAppUrl();
}

/** Hostname for portal subdomain rewrites (e.g. portal.zafirixpro.ma). */
export function getPortalHost(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_PORTAL_HOST?.trim();
  if (fromEnv) return fromEnv.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const portalUrl = trimOrigin(process.env.NEXT_PUBLIC_PORTAL_URL);
  if (!portalUrl) return null;
  try {
    return new URL(portalUrl.startsWith('http') ? portalUrl : `https://${portalUrl}`).host;
  } catch {
    return null;
  }
}

/** True when portal links use a separate host from the main app. */
export function isDedicatedPortalHost(): boolean {
  const portal = getPortalBaseUrl();
  const app = getPublicAppUrl();
  try {
    return new URL(portal).host !== new URL(app).host;
  } catch {
    return false;
  }
}

/** Join origin + path without double slashes. */
export function absoluteUrl(path: string, base?: string): string {
  const origin = (base ?? getPublicAppUrl()).replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p}`;
}
