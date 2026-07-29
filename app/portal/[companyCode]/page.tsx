import { notFound } from 'next/navigation';
import ClientPortalShell from '@/app/components/client-portal/ClientPortalShell';
import { normalizePortalAccessCode } from '@/app/lib/atlas-client-portal-links';

type Props = {
  params: Promise<{ companyCode: string }>;
};

/** Shareable link: /portal/{companyCode} or portal.zafirixpro.ma/{companyCode} */
export default async function PortalCompanyPage({ params }: Props) {
  const { companyCode } = await params;
  const code = normalizePortalAccessCode(decodeURIComponent(companyCode));
  if (!code) notFound();
  return <ClientPortalShell initialAccessCode={code} />;
}
