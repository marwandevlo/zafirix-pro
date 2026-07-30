'use client';

import type { FeatureCode } from '@/app/types/atlas-billing';
import { buildUsageUpsell } from '@/app/lib/atlas-plan-modules';
import { getActivePlan } from '@/app/lib/atlas-usage-limits';

export async function fetchBillingUsage() {
  const res = await fetch('/api/billing/usage', { credentials: 'include' });
  return res.json();
}

const FEATURE_VALUE_MESSAGES: Partial<Record<FeatureCode, string>> = {
  ai_requests_limit:
    'Ultimate débloque les projections fiscales IA — évitez jusqu’à 15 000 MAD/mois de pénalités DGI.',
  ocr_limit: 'Pro multiplie votre capacité OCR — gagnez 20 h/mois sur la saisie documentaire.',
  documents_per_month: 'Passez Pro pour des volumes illimités et le recouvrement intelligent.',
  payroll_limit: 'Pro automatise la paie multi-sociétés — réduisez les erreurs CNSS.',
};

export async function canUseFeatureClient(featureCode: FeatureCode): Promise<{
  allowed: boolean;
  messageFr?: string;
  upgradeHref?: string;
}> {
  try {
    const json = await fetchBillingUsage();
    if (!json.ok) return { allowed: true };
    if (json.trialExpired) {
      return {
        allowed: false,
        messageFr: 'Essai expiré — Pro couvre ~80 % des outils quotidiens dès 1 000 MAD/mois.',
        upgradeHref: '/payment?plan=pro',
      };
    }
    const q = (json.quotas ?? []).find((x: { featureCode: string }) => x.featureCode === featureCode);
    if (!q) return { allowed: true };
    if (q.unlimited) return { allowed: true };

    const allowed = q.allowed !== false && (q.remaining === null || q.remaining > 0);
    if (allowed) return { allowed: true };

    const plan = getActivePlan();
    const upsell = buildUsageUpsell({
      planId: plan?.id ?? 'free-trial',
      metric: featureCode === 'ai_requests_limit' ? 'ai_requests' : 'operations',
      used: q.used ?? 0,
      limit: q.limit ?? null,
    });

    return {
      allowed: false,
      messageFr:
        FEATURE_VALUE_MESSAGES[featureCode] ??
        upsell?.valueFr ??
        'Quota atteint — upgrade recommandé pour débloquer la croissance.',
      upgradeHref: upsell?.ctaHref ?? '/pricing',
    };
  } catch {
    return { allowed: true };
  }
}
