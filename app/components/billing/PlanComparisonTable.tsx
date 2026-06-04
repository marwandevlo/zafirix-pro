'use client';

import { useEffect, useState } from 'react';
import type { AtlasSubscriptionPlan } from '@/app/types/atlas-billing';
import { ATLAS_FEATURE_CODES, FEATURE_LABELS_FR } from '@/app/types/atlas-billing';

export function PlanComparisonTable({ className = '' }: { className?: string }) {
  const [plans, setPlans] = useState<AtlasSubscriptionPlan[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/billing/plans');
      const json = await res.json();
      if (json.ok) setPlans(json.plans ?? []);
    })();
  }, []);

  if (!plans.length) return null;

  return (
    <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left px-4 py-3 text-slate-500 font-medium">Fonctionnalité</th>
            {plans.map((p) => (
              <th key={p.id} className="px-4 py-3 text-center font-semibold text-slate-900">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-50 bg-slate-50/50">
            <td className="px-4 py-2 text-slate-600">Prix mensuel</td>
            {plans.map((p) => (
              <td key={p.id} className="px-4 py-2 text-center font-medium">{p.monthlyPrice.toLocaleString()} {p.currency}</td>
            ))}
          </tr>
          {ATLAS_FEATURE_CODES.map((fc) => (
            <tr key={fc} className="border-b border-slate-50">
              <td className="px-4 py-2 text-slate-600">{FEATURE_LABELS_FR[fc]}</td>
              {plans.map((p) => (
                <td key={p.id} className="px-4 py-2 text-center">
                  {p.features[fc] === null ? '∞' : p.features[fc]?.toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
