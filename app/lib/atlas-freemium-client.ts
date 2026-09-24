import type { FreemiumCheck, FreemiumMeter, FreemiumSnapshot } from '@/app/lib/atlas-freemium';

export async function fetchFreemiumSnapshot(): Promise<FreemiumSnapshot | null> {
  try {
    const res = await fetch('/api/billing/freemium', { credentials: 'include' });
    const json = await res.json();
    if (!res.ok || !json.ok) return null;
    return json as FreemiumSnapshot;
  } catch {
    return null;
  }
}

export async function consumeFreemiumClient(
  meter: FreemiumMeter,
  quantity = 1,
): Promise<FreemiumCheck> {
  const res = await fetch('/api/billing/freemium', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meter, quantity, consume: true }),
  });
  const json = (await res.json().catch(() => ({}))) as FreemiumCheck & {
    message?: string;
    messageFr?: string;
  };
  if (!res.ok) {
    return {
      allowed: false,
      upgradeRequired: true,
      plan: json.plan ?? 'free',
      meter,
      used: Number(json.used ?? 0),
      limit: json.limit ?? null,
      remaining: json.remaining ?? 0,
      code: 'quota_exceeded',
      messageFr: json.messageFr ?? json.message ?? 'Limite du forfait Gratuit atteinte. Passez à Pro.',
    };
  }
  return { ...json, allowed: true, upgradeRequired: false, meter };
}

export function isFreemiumQuotaError(error: unknown): boolean {
  const text = typeof error === 'string' ? error : JSON.stringify(error ?? '');
  return /quota_exceeded|Limite du forfait Gratuit|Upgrade to Pro|Passez à Pro/i.test(text);
}
