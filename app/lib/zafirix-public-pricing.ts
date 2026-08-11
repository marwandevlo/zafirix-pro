/**
 * Public marketing catalog for Zafirixpro pricing tiers
 * (aligned with zafirix_subscriptions plan_code).
 */

import type { ZafirixPlanCode } from '@/app/types/zafirix-usage';

export type ZafirixPublicTier = {
  code: ZafirixPlanCode;
  /** URL / payment slug */
  slug: string;
  nameFr: string;
  subtitleFr: string;
  taglineFr: string;
  /** Monthly price MAD; null = custom / usage-based */
  priceMadMonth: number | null;
  priceLabelFr: string;
  priceHintFr: string;
  popular: boolean;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel?: string;
  benefitsFr: string[];
  limitsFr: string[];
};

export const ZAFIRIX_PUBLIC_TIERS: ZafirixPublicTier[] = [
  {
    code: 'INDEPENDANT',
    slug: 'independant',
    nameFr: 'Indépendant',
    subtitleFr: 'Auto-entrepreneur',
    taglineFr: 'Facturation et conformité essentielles pour démarrer solo.',
    priceMadMonth: 49,
    priceLabelFr: '49 MAD',
    priceHintFr: '/ mois',
    popular: false,
    ctaLabel: 'Choisir Indépendant',
    ctaHref: '/signup?plan=INDEPENDANT',
    secondaryCtaLabel: 'Essai gratuit',
    benefitsFr: [
      'Module Auto-entrepreneur',
      'Factures & clients',
      'Jusqu’à 40 factures / mois',
      '25 expéditions / mois',
      '80 requêtes IA / mois',
    ],
    limitsFr: ['1 société', 'Packs pay-as-you-go disponibles'],
  },
  {
    code: 'PERSONNE_PHYSIQUE',
    slug: 'profession-liberale',
    nameFr: 'Profession Libérale',
    subtitleFr: 'Personne Physique',
    taglineFr: 'Pilotage fiscal et ledger pour professions libérales.',
    priceMadMonth: 149,
    priceLabelFr: '149 MAD',
    priceHintFr: '/ mois',
    popular: false,
    ctaLabel: 'Choisir Profession Libérale',
    ctaHref: '/signup?plan=PERSONNE_PHYSIQUE',
    secondaryCtaLabel: 'Essai gratuit',
    benefitsFr: [
      'Module Personne Physique',
      'Ledger & déclarations',
      'Jusqu’à 60 factures / mois',
      '120 requêtes IA / mois',
      'Support prioritaire e-mail',
    ],
    limitsFr: ['1 société', 'Add-ons factures & IA'],
  },
  {
    code: 'PME',
    slug: 'pme',
    nameFr: 'PME & E-commerce',
    subtitleFr: 'Croissance & logistique',
    taglineFr: 'Le forfait cœur de cible — volume, COD et collaboration.',
    priceMadMonth: 399,
    priceLabelFr: '399 MAD',
    priceHintFr: '/ mois',
    popular: true,
    ctaLabel: 'Choisir PME & E-commerce',
    ctaHref: '/signup?plan=PME',
    secondaryCtaLabel: 'Essai gratuit',
    benefitsFr: [
      'Logistique COD & inventaire',
      '500 factures / mois',
      '250 expéditions / mois',
      '1 500 requêtes IA / mois',
      'Multi-utilisateurs & packs add-on',
    ],
    limitsFr: ['Multi-sociétés selon quota', 'Pay-as-you-go au-delà des plafonds'],
  },
  {
    code: 'ULTIMATE',
    slug: 'ultimate',
    nameFr: 'Ultimate',
    subtitleFr: 'Cabinets & Entreprises',
    taglineFr: 'Usage-based, fair usage et accompagnement sur mesure.',
    priceMadMonth: null,
    priceLabelFr: 'Sur mesure',
    priceHintFr: 'Usage-based',
    popular: false,
    ctaLabel: 'Demander un devis',
    ctaHref: 'mailto:contact@zafirix.group?subject=ZAFIRIX%20Ultimate%20—%20devis',
    secondaryCtaLabel: 'Parler à un conseiller',
    benefitsFr: [
      'Quotas illimités (fair usage)',
      'Audit IA, gouvernance & pass auditeur',
      'Cabinets multi-dossiers',
      'Account manager & SLA',
      'Packs & overages négociés',
    ],
    limitsFr: ['Tarification adaptée au volume', 'Contrat annuel possible'],
  },
];

export function formatTierPrice(tier: ZafirixPublicTier): string {
  if (tier.priceMadMonth == null) return tier.priceLabelFr;
  return `${tier.priceMadMonth.toLocaleString('fr-MA')} MAD`;
}
