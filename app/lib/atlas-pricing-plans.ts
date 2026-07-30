export type AtlasCurrency = 'MAD';
export type AtlasBillingPeriod = 'trial' | 'year';

export type AtlasLimit =
  | { kind: 'fixed'; value: number }
  | { kind: 'unlimited' }
  | { kind: 'fair_usage' };

export type AtlasPricingPlan = {
  id: string;
  name: string;

  price: number;
  currency: AtlasCurrency;
  billingPeriod: AtlasBillingPeriod;

  /** Only meaningful when billingPeriod === 'trial'. */
  durationDays?: number;

  companiesLimit: AtlasLimit;
  usersLimit: AtlasLimit;
  operationsLimit: AtlasLimit;
  /** Max invoices for this plan; omit or unlimited for no invoice cap. */
  invoicesLimit?: AtlasLimit;

  description: string;
  isPopular: boolean;
  ctaLabel: string;
};

export function fixedLimit(value: number): AtlasLimit {
  return { kind: 'fixed', value };
}

export function unlimited(): AtlasLimit {
  return { kind: 'unlimited' };
}

export function fairUsage(): AtlasLimit {
  return { kind: 'fair_usage' };
}

export function formatLimit(limit: AtlasLimit): string {
  if (limit.kind === 'unlimited') return 'illimité';
  if (limit.kind === 'fair_usage') return 'fair usage';
  return String(limit.value);
}

export function formatPriceMadYear(priceMadPerYear: number): string {
  return `${priceMadPerYear.toLocaleString()} MAD/an`;
}

export const ATLAS_PRICING_PLANS: AtlasPricingPlan[] = [
  {
    id: 'free-trial',
    name: 'Free Trial',
    price: 0,
    currency: 'MAD',
    billingPeriod: 'trial',
    durationDays: 7,
    companiesLimit: fixedLimit(1),
    usersLimit: fixedLimit(1),
    operationsLimit: fixedLimit(20),
    invoicesLimit: fixedLimit(5),
    description: "Essai gratuit pour découvrir ZAFIRIX PRO pendant 7 jours.",
    isPopular: false,
    ctaLabel: 'Commencer l’essai',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 4500,
    currency: 'MAD',
    billingPeriod: 'year',
    companiesLimit: fixedLimit(1),
    usersLimit: fixedLimit(1),
    operationsLimit: fixedLimit(150),
    invoicesLimit: unlimited(),
    description: 'Pour indépendants et petites structures : l’essentiel pour démarrer.',
    isPopular: false,
    ctaLabel: 'Choisir Starter',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 6000,
    currency: 'MAD',
    billingPeriod: 'year',
    companiesLimit: fixedLimit(10),
    usersLimit: fixedLimit(3),
    operationsLimit: fixedLimit(500),
    invoicesLimit: unlimited(),
    description: 'Pour équipes en croissance : multi-sociétés et plus d’opérations.',
    isPopular: false,
    ctaLabel: 'Choisir Growth',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 12000,
    currency: 'MAD',
    billingPeriod: 'year',
    companiesLimit: fixedLimit(25),
    usersLimit: fixedLimit(5),
    operationsLimit: fixedLimit(1500),
    invoicesLimit: unlimited(),
    description: 'Le meilleur rapport valeur : volume confortable et collaboration.',
    isPopular: true,
    ctaLabel: 'Choisir Pro',
  },
  {
    id: 'business',
    name: 'Business',
    price: 26000,
    currency: 'MAD',
    billingPeriod: 'year',
    companiesLimit: fixedLimit(70),
    usersLimit: fixedLimit(12),
    operationsLimit: fixedLimit(4000),
    invoicesLimit: unlimited(),
    description: 'Pour groupes et cabinets : limites élevées et gestion avancée.',
    isPopular: false,
    ctaLabel: 'Choisir Business',
  },
  {
    id: 'advanced',
    name: 'Advanced',
    price: 45000,
    currency: 'MAD',
    billingPeriod: 'year',
    companiesLimit: fixedLimit(200),
    usersLimit: fixedLimit(25),
    operationsLimit: fixedLimit(8000),
    invoicesLimit: unlimited(),
    description: 'Pour opérations intensives : gros volumes et équipes élargies.',
    isPopular: false,
    ctaLabel: 'Choisir Advanced',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 120000,
    currency: 'MAD',
    billingPeriod: 'year',
    companiesLimit: unlimited(),
    usersLimit: unlimited(),
    operationsLimit: fairUsage(),
    invoicesLimit: unlimited(),
    description: 'Ultimate / Enterprise — audit IA, gouvernance CA, projections fiscales & fair usage illimité.',
    isPopular: false,
    ctaLabel: 'Contacter les ventes',
  },
];

export function getAtlasPlanById(planId: string): AtlasPricingPlan | undefined {
  return ATLAS_PRICING_PLANS.find((p) => p.id === planId);
}

/** Integer cap for DB snapshots; null when unlimited / fair usage. */
export function getPlanCompanyCap(planId: string): number | null {
  const p = getAtlasPlanById(planId);
  if (!p) return null;
  if (p.companiesLimit.kind === 'fixed') return p.companiesLimit.value;
  return null;
}

