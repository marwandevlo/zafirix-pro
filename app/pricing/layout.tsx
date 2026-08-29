import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tarifs — ZAFIRIX PRO',
  description: 'Forfaits Zafirixpro pour auto-entrepreneurs, professions libérales, PME et cabinets au Maroc.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    url: '/pricing',
    title: 'Tarifs — ZAFIRIX PRO',
    description: 'Forfaits Zafirixpro pour auto-entrepreneurs, professions libérales, PME et cabinets au Maroc.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tarifs — ZAFIRIX PRO',
    description: 'Forfaits Zafirixpro pour auto-entrepreneurs, professions libérales, PME et cabinets au Maroc.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
