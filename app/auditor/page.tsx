'use client';

import { KeyRound } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { AuditorPassWidget } from '@/app/components/dashboard/AuditorPassWidget';
import { ModuleGate } from '@/app/components/pricing/ModuleGate';

export default function AuditorPassPage() {
  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <KeyRound className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">Pass auditeur invité</h1>
            <BetaSurfaceBadge />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Créez des accès sécurisés à durée limitée pour experts-comptables et auditeurs externes.
          </p>
        </div>
        <ModuleGate moduleId="auditor_pass" blockContent>
          <AuditorPassWidget />
        </ModuleGate>
      </main>
    </div>
  );
}
