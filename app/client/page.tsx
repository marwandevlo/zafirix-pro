import Link from 'next/link';
import { isClientPortalBridgeEnabled } from '@/app/lib/atlas-sprint0-flags';
import ClientPortalDemo from './ClientPortalDemo';

export default function ClientPortalPage() {
  if (!isClientPortalBridgeEnabled()) {
    return (
      <div className="min-h-screen bg-[#0F1F3D] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-xl border border-gray-100 text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-lg font-bold text-[#0F1F3D]">
            Z
          </div>
          <h1 className="text-lg font-bold text-gray-900">Espace client</h1>
          <p className="mt-2 text-sm text-gray-600">
            L’accès démo (données fictives) n’est pas activé. Un portail client authentifié remplacera ce flux.
          </p>
          <p className="mt-4 text-xs text-gray-500 text-left leading-relaxed">
            Test interne / staging&nbsp;: définir{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">NEXT_PUBLIC_ENABLE_CLIENT_PORTAL=true</code>
            {' '}ou{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true</code>
            &nbsp;dans les variables d’environnement.
          </p>
          <Link
            href="/landing"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#0F1F3D] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1a3060]"
          >
            Retour
          </Link>
        </div>
      </div>
    );
  }

  return <ClientPortalDemo />;
}
