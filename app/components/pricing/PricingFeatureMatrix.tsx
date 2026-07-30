'use client';

import { Check, Lock } from 'lucide-react';
import { PREMIUM_MODULES } from '@/app/lib/atlas-plan-modules';
import type { FunnelPlanId } from '@/app/lib/atlas-pricing-funnel';

const TIER_INCLUDES: Record<FunnelPlanId, Set<string>> = {
  starter: new Set(),
  pro: new Set(['executive_briefing', 'debt_collection']),
  enterprise: new Set(PREMIUM_MODULES.map((m) => m.id)),
};

const ROWS = PREMIUM_MODULES.map((m) => ({
  id: m.id,
  label: m.labelFr,
  minTier: m.minTier,
  valueFr: m.valueHeadlineFr,
}));

export function PricingFeatureMatrix() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-slate-100 bg-slate-50/80">
        <h2 className="text-lg font-bold text-slate-900">Modules premium &amp; valeur débloquée</h2>
        <p className="text-sm text-slate-500 mt-1">
          Chaque ligne indique le gain financier typique — pas un simple verrouillage.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-semibold">Capacité</th>
              <th className="px-5 py-3 text-center font-semibold">Starter</th>
              <th className="px-5 py-3 text-center font-semibold bg-amber-50/80">Pro</th>
              <th className="px-5 py-3 text-center font-semibold">Ultimate</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">{row.label}</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{row.valueFr}</p>
                </td>
                {(['starter', 'pro', 'enterprise'] as FunnelPlanId[]).map((tier) => {
                  const included = TIER_INCLUDES[tier].has(row.id);
                  return (
                    <td
                      key={tier}
                      className={`px-5 py-3 text-center ${tier === 'pro' ? 'bg-amber-50/30' : ''}`}
                    >
                      {included ? (
                        <Check size={18} className="inline text-emerald-500" aria-label="Inclus" />
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Lock size={14} /> {row.minTier === 'enterprise' ? 'Ultimate' : 'Pro+'}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
