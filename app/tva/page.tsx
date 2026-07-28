import TvaPageClient from '@/app/tva/tva-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function TVAPage() {
  return <TvaPageClient />;
}
