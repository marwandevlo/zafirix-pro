'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import {
  canAccessPremiumModule,
  getModuleGate,
  type PremiumModuleId,
} from '@/app/lib/atlas-plan-modules';
import { getActivePlan } from '@/app/lib/atlas-usage-limits';
import { ValueUpgradePrompt } from '@/app/components/pricing/ValueUpgradePrompt';

type ModuleGateProps = {
  moduleId: PremiumModuleId;
  children: React.ReactNode;
  blockContent?: boolean;
};

export function ModuleGate({ moduleId, children, blockContent = false }: ModuleGateProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const plan = getActivePlan();
  const allowed = canAccessPremiumModule(plan?.id, moduleId);
  const config = getModuleGate(moduleId);

  if (allowed || !config) return <>{children}</>;

  if (!blockContent) {
    return (
      <>
        {children}
        <ValueUpgradePrompt
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          module={config}
          currentPlanId={plan?.id}
        />
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <div className="pointer-events-none opacity-40 select-none blur-[1px]">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0f1a32] text-white text-sm font-bold shadow-lg hover:bg-[#1a2a4a] transition-colors"
          >
            <Lock size={16} />
            Débloquer — voir la valeur
          </button>
        </div>
      </div>
      <ValueUpgradePrompt
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        module={config}
        currentPlanId={plan?.id}
      />
    </>
  );
}

export function usePremiumModuleAccess(moduleId: PremiumModuleId) {
  const router = useRouter();
  const plan = getActivePlan();
  const config = getModuleGate(moduleId);
  const allowed = canAccessPremiumModule(plan?.id, moduleId);

  const requireAccess = (): boolean => {
    if (allowed) return true;
    if (config) router.push(`/pricing?module=${moduleId}`);
    return false;
  };

  return { allowed, config, planId: plan?.id, requireAccess };
}
