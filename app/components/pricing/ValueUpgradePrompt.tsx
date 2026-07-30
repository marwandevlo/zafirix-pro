'use client';

import { useRouter } from 'next/navigation';
import { Lock, Sparkles, X } from 'lucide-react';
import type { ModuleGateConfig } from '@/app/lib/atlas-plan-modules';
import { formatMad, recommendedUpgradeTier } from '@/app/lib/atlas-plan-modules';
import { trackEvent } from '@/app/lib/analytics-track';

export type ValueUpgradePromptProps = {
  open: boolean;
  onClose: () => void;
  module: ModuleGateConfig;
  currentPlanId?: string | null;
};

export function ValueUpgradePrompt({ open, onClose, module, currentPlanId }: ValueUpgradePromptProps) {
  const router = useRouter();
  if (!open) return null;

  const targetPlan = recommendedUpgradeTier(currentPlanId, module.id);

  const goUpgrade = () => {
    trackEvent('upgrade_clicked', {
      surface: 'module_gate',
      moduleId: module.id,
      targetPlan,
    });
    router.push(`/payment?plan=${encodeURIComponent(targetPlan)}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-linear-to-r from-[#0f1a32] to-indigo-900 px-6 py-5 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 text-amber-300 mb-2">
            <Lock size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Offre supérieure requise</span>
          </div>
          <h2 className="text-lg font-bold leading-snug">{module.labelFr}</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
            <p className="text-sm font-bold text-emerald-900">{module.valueHeadlineFr}</p>
            <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">{module.valueDetailFr}</p>
            <p className="text-lg font-extrabold text-emerald-700 mt-3">
              ≈ {formatMad(module.monthlySavingsMad)}
              <span className="text-sm font-normal text-emerald-600">/mois économisés</span>
            </p>
          </div>
          {module.riskAvoidedFr && (
            <p className="text-xs text-slate-500 border-l-2 border-amber-400 pl-3">{module.riskAvoidedFr}</p>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={goUpgrade}
              className="w-full py-3 rounded-xl bg-[#0f1a32] text-white text-sm font-bold hover:bg-[#1a2a4a] flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              Passer à {targetPlan === 'enterprise' ? 'Ultimate / Enterprise' : 'Pro'} — upgrade instantané
            </button>
            <button
              type="button"
              onClick={() => {
                trackEvent('upgrade_clicked', { surface: 'module_gate', target: 'pricing' });
                router.push('/pricing');
                onClose();
              }}
              className="w-full py-2.5 text-sm font-medium text-indigo-600 hover:underline"
            >
              Comparer toutes les offres
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
