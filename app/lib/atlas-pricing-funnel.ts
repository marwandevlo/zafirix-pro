import type { AtlasPricingPlan } from '@/app/lib/atlas-pricing-plans';
import { ATLAS_PRICING_PLANS, formatLimit, formatPriceMadYear } from '@/app/lib/atlas-pricing-plans';

/** Public pricing funnel: 3 tiers — Starter (entry), Pro (target), Ultimate/Enterprise (anchor). */
export const FUNNEL_PLAN_IDS = ['starter', 'pro', 'enterprise'] as const;

export type FunnelPlanId = (typeof FUNNEL_PLAN_IDS)[number];

export type FunnelPlanBadge = 'most_popular' | 'enterprise_standard' | null;

export type FunnelPlanPresentation = {
  plan: AtlasPricingPlan;
  funnelId: FunnelPlanId;
  personaTitleFr: string;
  personaTitleAr: string;
  taglineFr: string;
  taglineAr: string;
  benefitsFr: string[];
  benefitsAr: string[];
  isMostPopular: boolean;
  badge: FunnelPlanBadge;
  /** Modules locked below this tier (shown on pricing card). */
  premiumHighlightsFr: string[];
  anchorNoteFr?: string;
};

const FUNNEL_META: Record<
  FunnelPlanId,
  Omit<FunnelPlanPresentation, 'plan' | 'isMostPopular' | 'badge'>
> = {
  starter: {
    funnelId: 'starter',
    personaTitleFr: 'Starter — Entrée symbolique',
    personaTitleAr: 'Starter — دخول رمزي',
    taglineFr: 'L’essentiel pour facturer et rester conforme — sans friction.',
    taglineAr: 'أساسيات الفوترة والامتثال بلا تعقيد.',
    benefitsFr: [
      'Facturation & clients centralisés',
      'TVA / IS — repères marocains',
      '1 société · 150 opérations/mois',
      '80 % des outils quotidiens exclus (audit IA, recouvrement auto…)',
    ],
    benefitsAr: [
      'فوترة وعملاء مركزيون',
      'TVA / IS — معالم مغربية',
      'شركة واحدة · 150 عملية/شهر',
    ],
    premiumHighlightsFr: [
      'Pass auditeur',
      'Simulateur fiscal IA',
      'Gouvernance CA',
      'Recouvrement intelligent',
    ],
  },
  pro: {
    funnelId: 'pro',
    personaTitleFr: 'Pro — Le choix des PME',
    personaTitleAr: 'Pro — خيار الشركات',
    taglineFr: '~80 % des outils Atlas OS — le meilleur rapport valeur/volume.',
    taglineAr: '~80٪ من أدوات Atlas OS — أفضل قيمة.',
    benefitsFr: [
      '25 sociétés · 5 utilisateurs · 1 500 opérations',
      'Briefing CEO IA & recouvrement intelligent',
      'Commissions, courrier, inventaire, logistique',
      'Factures illimitées · priorité support',
    ],
    benefitsAr: [
      '25 شركة · 5 مستخدمين · 1500 عملية',
      'موجز CEO وتحصيل ذكي',
      'عمولات وبريد ومخزون',
    ],
    premiumHighlightsFr: [
      'Pass auditeur invité',
      'Projections fiscales IA avancées',
      'Archive gouvernance CA',
      'Multi-rôles conseil d’administration',
    ],
  },
  enterprise: {
    funnelId: 'enterprise',
    personaTitleFr: 'Ultimate / Enterprise — Groupes & grands comptes',
    personaTitleAr: 'Ultimate / Enterprise — المجموعات',
    taglineFr: 'Ancre de valeur : conformité, audit, gouvernance & IA sans limites.',
    taglineAr: 'امتثال وتدقيق وحوكمة وذكاء بلا حدود.',
    benefitsFr: [
      'Sociétés & utilisateurs illimités (fair usage)',
      'Pass auditeur · audit IA · journal d’accès',
      'Simulateur fiscal what-if & projections IS/TVA',
      'Gouvernance CA · PV · résolutions · multi-rôles',
      'Account manager & SLA prioritaire',
    ],
    benefitsAr: [
      'شركات ومستخدمون بلا حد',
      'تصريح مدقق وتدقيق IA',
      'محاكاة ضريبية متقدمة',
      'حوكمة ومجلس إدارة',
    ],
    premiumHighlightsFr: [],
    anchorNoteFr: 'Conçu pour ancrer la valeur Pro — la plupart des PME choisissent Pro ; les groupes exigent Ultimate.',
  },
};

export function getFunnelPlanPresentations(): FunnelPlanPresentation[] {
  return FUNNEL_PLAN_IDS.map((id) => {
    const plan = ATLAS_PRICING_PLANS.find((p) => p.id === id);
    if (!plan) throw new Error(`Missing pricing plan: ${id}`);
    const meta = FUNNEL_META[id];
    return {
      plan,
      funnelId: id,
      personaTitleFr: meta.personaTitleFr,
      personaTitleAr: meta.personaTitleAr,
      taglineFr: meta.taglineFr,
      taglineAr: meta.taglineAr,
      benefitsFr: meta.benefitsFr,
      benefitsAr: meta.benefitsAr,
      premiumHighlightsFr: meta.premiumHighlightsFr,
      anchorNoteFr: meta.anchorNoteFr,
      isMostPopular: id === 'pro',
      badge: id === 'pro' ? 'most_popular' : id === 'enterprise' ? 'enterprise_standard' : null,
    };
  });
}

export function monthlyEquivalentMad(plan: AtlasPricingPlan): string {
  if (plan.billingPeriod !== 'year') return '—';
  const m = Math.round(plan.price / 12);
  return `${m.toLocaleString('fr-MA')} MAD/mois`;
}

export { formatLimit, formatPriceMadYear };
