import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/landing/fr' },
  openGraph: { url: '/landing/fr', locale: 'fr_MA' },
};

export default function FrenchLandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
