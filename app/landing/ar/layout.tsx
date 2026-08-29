import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/landing/ar' },
  openGraph: { url: '/landing/ar', locale: 'ar_MA' },
};

export default function ArabicLandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
