/** Normalize a document.referrer / ?ref= into a dashboard source label. */

const SOCIAL_HOSTS: Record<string, string> = {
  't.co': 'twitter.com',
  'twitter.com': 'twitter.com',
  'x.com': 'twitter.com',
  'l.facebook.com': 'facebook.com',
  'facebook.com': 'facebook.com',
  'm.facebook.com': 'facebook.com',
  'instagram.com': 'instagram.com',
  'l.instagram.com': 'instagram.com',
  'linkedin.com': 'linkedin.com',
  'lnkd.in': 'linkedin.com',
  'tiktok.com': 'tiktok.com',
  'youtube.com': 'youtube.com',
  'youtu.be': 'youtube.com',
  'wa.me': 'whatsapp.com',
  'whatsapp.com': 'whatsapp.com',
};

const SEARCH_HOSTS = new Set([
  'google.com',
  'google.fr',
  'google.co.ma',
  'bing.com',
  'yahoo.com',
  'duckduckgo.com',
  'baidu.com',
]);

export function normalizeReferralCodeLabel(raw: string | null | undefined): string {
  const code = (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
  return code ? `affiliate:${code}` : '';
}

export function classifyTrafficSource(params: {
  referrerUrl?: string | null;
  affiliateCode?: string | null;
  currentHost?: string | null;
}): string {
  const affiliate = normalizeReferralCodeLabel(params.affiliateCode);
  if (affiliate) return affiliate;

  const raw = (params.referrerUrl ?? '').trim();
  if (!raw) return 'direct';

  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const current = (params.currentHost ?? '').replace(/^www\./, '').toLowerCase();
    if (current && (host === current || host.endsWith(`.${current}`))) return 'internal';
    if (SOCIAL_HOSTS[host]) return SOCIAL_HOSTS[host]!;
    const root = host.split('.').slice(-2).join('.');
    if (SOCIAL_HOSTS[root]) return SOCIAL_HOSTS[root]!;
    if (SEARCH_HOSTS.has(host) || SEARCH_HOSTS.has(root) || host.startsWith('google.')) return host.startsWith('google.') ? 'google.com' : root || host;
    return host || 'direct';
  } catch {
    return 'direct';
  }
}

export function trafficSourceKind(label: string): 'affiliate' | 'search' | 'social' | 'direct' | 'internal' | 'referral' {
  if (label.startsWith('affiliate:')) return 'affiliate';
  if (label === 'direct') return 'direct';
  if (label === 'internal') return 'internal';
  if (label === 'google.com' || SEARCH_HOSTS.has(label)) return 'search';
  if (Object.values(SOCIAL_HOSTS).includes(label)) return 'social';
  return 'referral';
}
