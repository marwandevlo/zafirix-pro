import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tarifs — ZAFIRIX PRO',
  description:
    'Freemium Zafirixpro : Plan Gratuit (0 DH / mois) puis Plan Pro — factures, COD et scans IA pour les entreprises au Maroc.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    url: '/pricing',
    title: 'Tarifs — ZAFIRIX PRO',
    description:
      'Freemium Zafirixpro : Plan Gratuit (0 DH / mois) puis Plan Pro — factures, COD et scans IA pour les entreprises au Maroc.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tarifs — ZAFIRIX PRO',
    description:
      'Freemium Zafirixpro : Plan Gratuit (0 DH / mois) puis Plan Pro — factures, COD et scans IA pour les entreprises au Maroc.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
