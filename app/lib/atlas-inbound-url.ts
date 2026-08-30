import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';

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

  const messy = params.get('ref') ?? params.get('referral') ?? '';
  const cut = messy.split(/[?&#]/)[0] ?? '';
  return normalizeReferralCode(cut);
}
