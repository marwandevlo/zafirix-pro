import { redirect } from 'next/navigation';
import { extractReferralCodeFromSearch } from '@/app/lib/atlas-inbound-url';

/** Filesystem fallback for `zafirixpro.com/ar?ref=` (Facebook / in-app browsers). */
export default async function ArabicAliasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') raw.set(key, value);
    else if (Array.isArray(value) && value[0]) raw.set(key, value[0]);
  }
  const ref = extractReferralCodeFromSearch(raw.toString());
  redirect(ref ? `/landing/ar?ref=${encodeURIComponent(ref)}` : '/landing/ar');
}
