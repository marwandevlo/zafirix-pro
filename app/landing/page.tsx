import { redirect } from 'next/navigation';

function queryFromSearchParams(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value) q.set(key, value);
    else if (Array.isArray(value) && value[0]) q.set(key, value[0]);
  }
  const suffix = q.toString();
  return suffix ? `?${suffix}` : '';
}

/** Default marketing entry → French landing. Preserve ?ref= and other query flags. */
export default async function LandingIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  redirect(`/landing/fr${queryFromSearchParams(params)}`);
}
