/**
 * Premium module gating by public pricing tier (Starter → Pro → Ultimate/Enterprise).
 */

import type { FunnelPlanId } from '@/app/lib/atlas-pricing-funnel';

export type PremiumModuleId =
  | 'auditor_pass'
  | 'ai_forecasting'
  | 'debt_collection'
  | 'multi_role_access'
  | 'governance_archive'
  | 'tax_whatif'
  | 'executive_briefing';

export type PlanTier = FunnelPlanId | 'free-trial' | 'growth' | 'business' | 'advanced';

export type ModuleGateConfig = {
  id: PremiumModuleId;
  labelFr: string;
  href: string;
  minTier: FunnelPlanId;
  valueHeadlineFr: string;
  valueDetailFr: string;
  monthlySavingsMad: number;
  riskAvoidedFr?: string;
};

const TIER_RANK: Record<string, number> = {
  'free-trial': 0,
  starter: 1,
  growth: 2,
  pro: 3,
  business: 4,
  advanced: 5,
  enterprise: 6,
};

export const PREMIUM_MODULES: ModuleGateConfig[] = [
  {
    id: 'auditor_pass',
    labelFr: 'Pass auditeur & audit IA',
    href: '/auditor',
    minTier: 'enterprise',
    valueHeadlineFr: 'Évitez 15 000 MAD/mois de pénalités fiscales',
    valueDetailFr:
      'Portail auditeur sécurisé, journal d’accès et contrôles IA réservés Ultimate — conformité DGI & liasse sans friction.',
    monthlySavingsMad: 15000,
    riskAvoidedFr: 'Retards de déclaration TVA/IS et majorations DGI',
  },
  {
    id: 'ai_forecasting',
    labelFr: 'Simulateur fiscal IA & projections',
    href: '/simulateur-fiscal',
    minTier: 'enterprise',
    valueHeadlineFr: 'Anticipez votre IS et TVA avant clôture',
    valueDetailFr:
      'Scénarios what-if IA, projections IS/TVA et comparaison multi-exercices — réservé Ultimate.',
    monthlySavingsMad: 8500,
    riskAvoidedFr: 'Mauvaise provision fiscale en fin d’exercice',
  },
  {
    id: 'debt_collection',
    labelFr: 'Recouvrement intelligent',
    href: '/recouvrement',
    minTier: 'pro',
    valueHeadlineFr: 'Récupérez jusqu’à 12 % de créances en retard',
    valueDetailFr:
      'Relances automatiques, scoring risque client et suivi aging — Pro et Ultimate.',
    monthlySavingsMad: 6200,
  },
  {
    id: 'multi_role_access',
    labelFr: 'Accès multi-rôles & gouvernance',
    href: '/gouvernance',
    minTier: 'enterprise',
    valueHeadlineFr: 'Sécurisez le CA et les PV avec contrôle d’accès',
    valueDetailFr:
      'Membres du conseil, niveaux de confidentialité et archive PV — Ultimate uniquement.',
    monthlySavingsMad: 4000,
  },
  {
    id: 'governance_archive',
    labelFr: 'Archive gouvernance & CA',
    href: '/gouvernance',
    minTier: 'enterprise',
    valueHeadlineFr: 'Centralisez PV et résolutions associés',
    valueDetailFr: 'Archive sécurisée des décisions corporate — tier Ultimate.',
    monthlySavingsMad: 3500,
  },
  {
    id: 'tax_whatif',
    labelFr: 'Planificateur fiscal IA',
    href: '/simulateur-fiscal',
    minTier: 'enterprise',
    valueHeadlineFr: 'Optimisez votre charge fiscale légalement',
    valueDetailFr: 'Moteur what-if avec recommandations IA — Ultimate.',
    monthlySavingsMad: 9000,
  },
  {
    id: 'executive_briefing',
    labelFr: 'Briefing CEO IA',
    href: '/briefing-ceo',
    minTier: 'pro',
    valueHeadlineFr: 'Décisions direction en 5 minutes / semaine',
    valueDetailFr: 'Synthèse KPI, trésorerie et alertes — inclus Pro & Ultimate.',
    monthlySavingsMad: 2800,
  },
];

export function normalizePlanToTier(planId: string | null | undefined): PlanTier {
  if (!planId) return 'free-trial';
  if (planId in TIER_RANK) return planId as PlanTier;
  return 'starter';
}

export function tierMeetsMinimum(currentPlanId: string | null | undefined, minTier: FunnelPlanId): boolean {
  const current = TIER_RANK[normalizePlanToTier(currentPlanId)] ?? 0;
  const required = TIER_RANK[minTier] ?? 0;
  return current >= required;
}

export function getModuleGate(moduleId: PremiumModuleId): ModuleGateConfig | undefined {
  return PREMIUM_MODULES.find((m) => m.id === moduleId);
}

export function canAccessPremiumModule(
  currentPlanId: string | null | undefined,
  moduleId: PremiumModuleId,
): boolean {
  const mod = getModuleGate(moduleId);
  if (!mod) return true;
  return tierMeetsMinimum(currentPlanId, mod.minTier);
}

export function recommendedUpgradeTier(currentPlanId: string | null | undefined, moduleId: PremiumModuleId): FunnelPlanId {
  const mod = getModuleGate(moduleId);
  if (!mod) return 'pro';
  if (tierMeetsMinimum(currentPlanId, mod.minTier)) return mod.minTier;
  return mod.minTier;
}

export function formatMad(value: number): string {
  return `${value.toLocaleString('fr-MA')} MAD`;
}

/** ROI calculator inputs → estimated monthly loss without Ultimate tools. */
export function estimateMonthlyLoss(params: {
  invoiceVolume: number;
  staffSize: number;
  overdueInvoicesPct: number;
}): {
  penaltyRiskMad: number;
  collectionGapMad: number;
  adminWasteMad: number;
  totalLossMad: number;
  recommendedPlan: FunnelPlanId;
} {
  const { invoiceVolume, staffSize, overdueInvoicesPct } = params;
  const penaltyRiskMad = Math.round(Math.min(25000, 800 + invoiceVolume * 45 + staffSize * 120));
  const collectionGapMad = Math.round((overdueInvoicesPct / 100) * invoiceVolume * 850);
  const adminWasteMad = Math.round(staffSize * 1800 + invoiceVolume * 12);
  const totalLossMad = penaltyRiskMad + collectionGapMad + adminWasteMad;

  let recommendedPlan: FunnelPlanId = 'starter';
  if (totalLossMad > 8000 || staffSize >= 8 || invoiceVolume >= 80) recommendedPlan = 'enterprise';
  else if (totalLossMad > 2500 || staffSize >= 3 || invoiceVolume >= 25) recommendedPlan = 'pro';

  return { penaltyRiskMad, collectionGapMad, adminWasteMad, totalLossMad, recommendedPlan };
}

export type UsageUpsellTrigger = {
  show: boolean;
  level: 'warning' | 'critical';
  metric: string;
  used: number;
  limit: number;
  percent: number;
  headlineFr: string;
  valueFr: string;
  targetPlan: FunnelPlanId;
  ctaHref: string;
};

export function buildUsageUpsell(params: {
  planId: string | null;
  metric: 'invoices' | 'operations' | 'companies' | 'users' | 'ai_requests';
  used: number;
  limit: number | null;
}): UsageUpsellTrigger | null {
  const { planId, metric, used, limit } = params;
  if (limit === null || limit <= 0) return null;
  const percent = used / limit;
  if (percent < 0.75) return null;

  const level: 'warning' | 'critical' = percent >= 1 ? 'critical' : 'warning';
  const targetPlan: FunnelPlanId =
    planId === 'starter' || planId === 'free-trial' ? 'pro' : planId === 'pro' ? 'enterprise' : 'enterprise';

  const metricLabels: Record<string, string> = {
    invoices: 'factures',
    operations: 'opérations',
    companies: 'sociétés',
    users: 'utilisateurs',
    ai_requests: 'requêtes IA',
  };

  const valueByMetric: Record<string, string> = {
    invoices: 'Passez Pro pour des volumes illimités et le recouvrement intelligent (+12 % encaissements).',
    operations: 'Pro débloque 1 500 opérations/mois — évitez les blocages en période de clôture.',
    companies: 'Pro inclut 25 sociétés — idéal cabinets & holdings en croissance.',
    users: 'Collaborez à 5 avec Pro ; Ultimate pour rôles CA & audit.',
    ai_requests: 'Ultimate : projections fiscales IA illimitées — économisez 15 000 MAD/mois de pénalités évitables.',
  };

  return {
    show: true,
    level,
    metric,
    used,
    limit,
    percent,
    headlineFr:
      level === 'critical'
        ? `Limite ${metricLabels[metric] ?? metric} atteinte (${used}/${limit})`
        : `${Math.round(percent * 100)} % de votre quota ${metricLabels[metric] ?? metric}`,
    valueFr: valueByMetric[metric] ?? 'Passez à l’offre supérieure pour débloquer la croissance.',
    targetPlan,
    ctaHref: `/payment?plan=${encodeURIComponent(targetPlan)}`,
  };
}
