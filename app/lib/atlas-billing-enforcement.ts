'use client';

import type { FeatureCode } from '@/app/types/atlas-billing';

export async function fetchBillingUsage() {
  const res = await fetch('/api/billing/usage', { credentials: 'include' });
  return res.json();
}

export async function canUseFeatureClient(featureCode: FeatureCode): Promise<{
  allowed: boolean;
  messageFr?: string;
}> {
  try {
    const json = await fetchBillingUsage();
    if (!json.ok) return { allowed: true };
    if (json.trialExpired) {
      return { allowed: false, messageFr: 'Essai expiré — passez à une offre supérieure.' };
    }
    const q = (json.quotas ?? []).find((x: { featureCode: string }) => x.featureCode === featureCode);
    if (!q) return { allowed: true };
    if (q.unlimited) return { allowed: true };
    return {
      allowed: q.allowed !== false && (q.remaining === null || q.remaining > 0),
      messageFr: q.allowed === false
        ? `Quota atteint pour ${featureCode}. Consultez /billing pour upgrader.`
        : undefined,
    };
  } catch {
    return { allowed: true };
  }
}
