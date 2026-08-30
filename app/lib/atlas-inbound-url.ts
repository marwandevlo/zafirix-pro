import { ATLAS_PRODUCTION_HOST, ATLAS_PRODUCTION_ORIGIN } from '@/app/lib/atlas-app-url';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';

/** Apex production host (Facebook / WhatsApp often omit www). */
export const ATLAS_CANONICAL_HOST = ATLAS_PRODUCTION_HOST;
export const ATLAS_CANONICAL_ORIGIN = ATLAS_PRODUCTION_ORIGIN;

const PRODUCTION_ALIAS_HOSTS = new Set([
  ATLAS_CANONICAL_HOST,
  `www.${ATLAS_CANONICAL_HOST}`,
  'zafirixpro.vercel.app',
]);

/** Query keys we must keep on marketing / referral entry. Everything else is stripped. */
const MARKETING_QUERY_ALLOW = new Set(['ref', 'referral', 'lang']);

/** Query keys we keep on app / auth routes (OAuth, reset, paddle return). */
const APP_QUERY_ALLOW = new Set([
  'ref',
  'referral',
  'lang',
  'next',
  'code',
  'token',
  'state',
  'error',
  'error_description',
  'error_code',
  'addon',
  'plan',
  'period',
]);

const TRACKING_QUERY_EXACT = new Set([
  'fbclid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'mc_eid',
  'mc_cid',
  '_ga',
  '_gl',
  '_gac',
  'igshid',
  'igsh',
  'si',
  'yclid',
  'ref_src',
  'ref_url',
  'mibextid',
  'ndclid',
  'srsltid',
  'mc_tc',
  '__tn__',
  'sfnsn',
  'eav',
  'paipv',
  'rdid',
  'share_id',
]);

const LOCALE_LANDING: Record<string, string> = {
  fr: '/landing/fr',
  ar: '/landing/ar',
};

export function isProductionMarketingHost(host: string): boolean {
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  return PRODUCTION_ALIAS_HOSTS.has(h);
}

export function shouldForceHttps(_host: string): boolean {
  // Platform (Vercel) terminates TLS. Middleware must not 308 http↔https or www↔apex.
  return false;
}

export function configuredCanonicalHost(): string {
  return ATLAS_CANONICAL_HOST;
}

export function resolveCanonicalHost(_requestHost: string): string | null {
  return null;
}

/** Facebook / in-app browsers often emit `?ref=X?fbclid=` or a second `?`. */
export function normalizeRawSearch(search: string): string {
  let raw = (search || '').replace(/^\?/, '').trim();
  if (!raw) return '';
  raw = raw.replace(/\?/g, '&').replace(/&&+/g, '&').replace(/^&|&$/g, '');
  return raw;
}

export function extractReferralCodeFromSearch(search: string): string {
  const normalized = normalizeRawSearch(search);
  if (!normalized) return '';
  const params = new URLSearchParams(normalized);
  const direct = normalizeReferralCode(params.get('ref') ?? params.get('referral'));
  if (direct) return direct;

  // `ref` value itself may contain a jammed tracker: CODE&fbclid=… or CODE?fbclid=…
  const messy = params.get('ref') ?? params.get('referral') ?? '';
  const cut = messy.split(/[?&#]/)[0] ?? '';
  return normalizeReferralCode(cut);
}

export function sanitizeSearchParams(
  search: string,
  mode: 'marketing' | 'app',
): { query: URLSearchParams; referralCode: string; stripped: boolean } {
  const allow = mode === 'marketing' ? MARKETING_QUERY_ALLOW : APP_QUERY_ALLOW;
  const incoming = new URLSearchParams(normalizeRawSearch(search));
  const referralCode = extractReferralCodeFromSearch(search);
  const query = new URLSearchParams();

  incoming.forEach((value, key) => {
    const k = key.trim();
    if (!k) return;
    const lower = k.toLowerCase();
    if (TRACKING_QUERY_EXACT.has(lower) || lower.startsWith('utm_')) return;
    if (!allow.has(lower)) return;
    if (lower === 'ref' || lower === 'referral') return;
    if (value) query.set(lower, value);
  });

  if (referralCode) query.set('ref', referralCode);

  const stripped =
    incoming.toString() !== query.toString() || normalizeRawSearch(search) !== incoming.toString();
  return { query, referralCode, stripped };
}

export function normalizeInboundPathname(pathname: string): string {
  let path = pathname || '/';
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep raw
  }
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  return path || '/';
}

/**
 * Map social / locale shortcuts onto real App Router pages.
 * `/fr?ref=` and `/ar?ref=` are not filesystem routes — they 404 without this.
 */
export function resolveMarketingAliasPath(pathname: string): string | null {
  const path = normalizeInboundPathname(pathname).toLowerCase();
  if (path === '/fr' || path === '/landing/fr') return '/landing/fr';
  if (path === '/ar' || path === '/landing/ar') return '/landing/ar';
  if (path === '/landing' || path === '/home' || path === '/index') return '/landing/fr';

  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 1 && segments[0] && LOCALE_LANDING[segments[0]] && segments[1] !== 'landing') {
    if (segments.length === 1) return LOCALE_LANDING[segments[0]];
    if (segments[1] === 'ref' && segments[2]) return LOCALE_LANDING[segments[0]];
  }
  return null;
}

export function isMarketingEntryPath(pathname: string): boolean {
  const path = normalizeInboundPathname(pathname).toLowerCase();
  if (path === '/' || path === '/pricing' || path === '/signup' || path === '/register' || path === '/login') {
    return true;
  }
  if (path === '/landing' || path.startsWith('/landing/')) return true;
  if (path === '/fr' || path === '/ar' || path === '/home') return true;
  if (path === '/blog' || path.startsWith('/blog/')) return true;
  return false;
}

export function buildCanonicalUrl(params: {
  protocol: string;
  host: string;
  pathname: string;
  search: string;
  forwardedProto?: string | null;
}): { href: string; changed: boolean; referralCode: string } {
  const requestHost = (params.host || '').split(':')[0] || params.host;
  const forwarded = (params.forwardedProto || '').split(',')[0]?.trim().toLowerCase();
  const protoNow = forwarded === 'https' || forwarded === 'http' ? forwarded : params.protocol.replace(':', '');

  const host = requestHost;
  const proto = protoNow === 'http' || protoNow === 'https' ? protoNow : 'https';

  const normalizedPath = normalizeInboundPathname(params.pathname);
  const alias = resolveMarketingAliasPath(normalizedPath);
  let pathname = alias ?? normalizedPath;

  const mode = isMarketingEntryPath(normalizedPath) || alias ? 'marketing' : 'app';
  const { query, referralCode } = sanitizeSearchParams(params.search, mode);
  if (pathname === '/' && referralCode) pathname = '/landing/fr';

  const href = `${proto}://${host}${pathname}${query.toString() ? `?${query.toString()}` : ''}`;

  const originalPath = normalizeInboundPathname(params.pathname);
  const originalSearch = normalizeRawSearch(params.search);
  const changed = pathname !== originalPath;

  return { href, changed, referralCode };
}
