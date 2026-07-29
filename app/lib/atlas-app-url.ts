/**
 * Canonical public URLs for Zafirix Pro (emails, shared links, OAuth redirects).
 *
 * Priority: NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_SITE_URL → VERCEL_URL → localhost.
 * Set both APP_URL and SITE_URL to the same production origin on Vercel (no trailing slash).
 */

function trimOrigin(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.replace(/\/$/, '');
}

/** Primary app origin (dashboard, auth, emails). */
export function getPublicAppUrl(): string {
  const explicit =
    trimOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    trimOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit;

  const vercel = trimOrigin(process.env.VERCEL_URL);
  if (vercel) {
    return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return 'http://localhost:3000';
}

/** Dedicated client portal origin (e.g. https://portal.zafirixpro.ma). Falls back to app URL. */
export function getPortalBaseUrl(): string {
  return trimOrigin(process.env.NEXT_PUBLIC_PORTAL_URL) ?? getPublicAppUrl();
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
