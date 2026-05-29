'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import {
  getDemoFeatureBlockedMessage,
  type AtlasDemoFeatureId,
} from '@/app/lib/atlas-runtime-guards';

type Props = {
  title: string;
  featureId?: AtlasDemoFeatureId;
  withSidebar?: boolean;
};

export function ProductionBlockedSurface({ title, featureId, withSidebar = true }: Props) {
  const message = getDemoFeatureBlockedMessage(featureId);

  const body = (
    <main className="flex-1 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <h1 className="text-xl font-bold text-gray-800">{title}</h1>
      </header>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Shield size={22} aria-hidden />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#1B2A4A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#243660]"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    </main>
  );

  if (!withSidebar) {
    return <div className="min-h-screen bg-gray-50 flex flex-col">{body}</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      {body}
    </div>
  );
}
