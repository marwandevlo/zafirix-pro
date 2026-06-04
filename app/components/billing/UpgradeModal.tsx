'use client';

import { useEffect, useState } from 'react';
import { X, ArrowUpRight, Check } from 'lucide-react';
import type { AtlasSubscriptionPlan, PlanCode } from '@/app/types/atlas-billing';
import { FEATURE_LABELS_FR, ATLAS_FEATURE_CODES } from '@/app/types/atlas-billing';

export type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  currentPlanCode?: PlanCode;
  onSelectPlan?: (code: PlanCode) => void;
};

export function UpgradeModal({ open, onClose, currentPlanCode = 'FREE', onSelectPlan }: UpgradeModalProps) {
  const [plans, setPlans] = useState<AtlasSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch('/api/billing/plans', { credentials: 'include' });
      const json = await res.json();
      if (json.ok) setPlans(json.plans ?? []);
    })();
  }, [open]);

  const requestUpgrade = async (code: PlanCode) => {
    setRequesting(code);
    setLoading(true);
    try {
      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: code }),
      });
      const json = await res.json();
      if (json.ok) onSelectPlan?.(code);
    } finally {
      setLoading(false);
      setRequesting(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Changer d&apos;offre</h2>
            <p className="text-sm text-gray-500">Plan actuel: {currentPlanCode} — paiement non requis à cette étape</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isCurrent = plan.code === currentPlanCode;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-4 flex flex-col ${isCurrent ? 'border-amber-400 bg-amber-50/50' : 'border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                  {isCurrent && <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">Actuel</span>}
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-1">
                  {plan.monthlyPrice.toLocaleString()} <span className="text-sm font-normal text-gray-500">{plan.currency}/mois</span>
                </p>
                <p className="text-xs text-gray-500 mb-3">{plan.description}</p>
                <ul className="text-xs text-gray-600 space-y-1 flex-1 mb-4">
                  {ATLAS_FEATURE_CODES.slice(0, 4).map((fc) => (
                    <li key={fc} className="flex items-center gap-1">
                      <Check size={12} className="text-green-600 shrink-0" />
                      {FEATURE_LABELS_FR[fc]}: {plan.features[fc] === null ? '∞' : plan.features[fc]}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={isCurrent || loading}
                  onClick={() => void requestUpgrade(plan.code)}
                  className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${
                    isCurrent ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-[#0F1F3D] text-white hover:bg-[#1B2A4A]'
                  }`}
                >
                  {requesting === plan.code ? 'En cours…' : isCurrent ? 'Plan actuel' : (
                    <>Demander upgrade <ArrowUpRight size={14} /></>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
