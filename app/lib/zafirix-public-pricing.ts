/**
 * Public marketing catalog for Zafirixpro pricing tiers
 * (Freemium: Plan Gratuit + Plan Pro).
 */

export type ZafirixPublicTierCode = 'FREE' | 'PRO';

export type ZafirixPublicTier = {
  code: ZafirixPublicTierCode;
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
    code: 'FREE',
    slug: 'gratuit',
    nameFr: 'Plan Gratuit',
    subtitleFr: 'Freemium',
    taglineFr: 'Démarrez sans carte — quotas mensuels pour facturer, suivre vos colis et scanner.',
    priceMadMonth: 0,
    priceLabelFr: '0 DH',
    priceHintFr: '/ mois',
    popular: false,
    ctaLabel: 'Commencer gratuitement',
    ctaHref: '/signup',
    benefitsFr: [
      '15 Factures & Devis par mois',
      '30 Suivis de colis COD par mois',
      '5 Scans IA (OCR) par mois',
      '1 Utilisateur inclus',
    ],
    limitsFr: ['Quotas réinitialisés chaque mois'],
  },
  {
    code: 'PRO',
    slug: 'pro',
    nameFr: 'Plan Pro',
    subtitleFr: 'Pour scaler',
    taglineFr: 'Volume illimité, scans IA étendus, équipe et support prioritaire.',
    priceMadMonth: 149,
    priceLabelFr: '149 DH',
    priceHintFr: '/ mois',
    popular: true,
    ctaLabel: 'Passer à Pro',
    ctaHref: '/signup?plan=PRO',
    benefitsFr: [
      'Factures & Devis illimités',
      'Suivi COD illimité',
      'Scans IA étendus',
      'Multi-utilisateurs & support prioritaire',
    ],
    limitsFr: ['Sans plafonds mensuels sur factures, devis et COD'],
  },
];

export function formatTierPrice(tier: ZafirixPublicTier): string {
  if (tier.priceMadMonth == null) return tier.priceLabelFr;
  return `${tier.priceMadMonth.toLocaleString('fr-MA')} DH`;
}
