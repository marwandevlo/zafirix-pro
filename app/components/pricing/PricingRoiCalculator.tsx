'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Calculator, TrendingDown, TrendingUp } from 'lucide-react';
import {
  estimateMonthlyLoss,
  formatMad,
} from '@/app/lib/atlas-plan-modules';
import type { FunnelPlanId } from '@/app/lib/atlas-pricing-funnel';
import { getFunnelPlanPresentations } from '@/app/lib/atlas-pricing-funnel';
import { formatPriceMadYear } from '@/app/lib/atlas-pricing-plans';
import { trackEvent } from '@/app/lib/analytics-track';

type PricingRoiCalculatorProps = {
  onSelectPlan?: (planId: FunnelPlanId) => void;
};

export function PricingRoiCalculator({ onSelectPlan }: PricingRoiCalculatorProps) {
  const [invoiceVolume, setInvoiceVolume] = useState(40);
  const [staffSize, setStaffSize] = useState(5);
  const [overduePct, setOverduePct] = useState(18);

  const result = useMemo(
    () =>
      estimateMonthlyLoss({
        invoiceVolume,
        staffSize,
        overdueInvoicesPct: overduePct,
      }),
    [invoiceVolume, staffSize, overduePct],
  );

  const plans = useMemo(() => getFunnelPlanPresentations(), []);
  const recommended = plans.find((p) => p.funnelId === result.recommendedPlan);

  return (
    <div className="rounded-2xl border border-indigo-100 bg-linear-to-br from-slate-900 via-[#121f3d] to-indigo-950 text-white shadow-xl overflow-hidden">
      <div className="px-6 sm:px-8 py-6 border-b border-white/10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-300">
            <Calculator size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">Calculateur ROI</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mt-2">Combien vous coûte l&apos;inaction ?</h2>
          <p className="text-sm text-white/60 mt-1 max-w-xl">
            Estimez pertes mensuelles (pénalités, créances, temps admin) vs. l&apos;investissement Atlas OS.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/50 uppercase tracking-wide">Perte estimée / mois</p>
          <p className="text-3xl font-extrabold text-red-300">{formatMad(result.totalLossMad)}</p>
        </div>
      </div>

      <div className="px-6 sm:px-8 py-6 grid lg:grid-cols-2 gap-8">
        <div className="space-y-5">
          <label className="block">
            <span className="text-xs text-white/60">Factures / mois</span>
            <input
              type="range"
              min={5}
              max={200}
              value={invoiceVolume}
              onChange={(e) => setInvoiceVolume(Number(e.target.value))}
              className="w-full mt-2 accent-amber-400"
            />
            <span className="text-sm font-semibold">{invoiceVolume}</span>
          </label>
          <label className="block">
            <span className="text-xs text-white/60">Collaborateurs</span>
            <input
              type="range"
              min={1}
              max={30}
              value={staffSize}
              onChange={(e) => setStaffSize(Number(e.target.value))}
              className="w-full mt-2 accent-amber-400"
            />
            <span className="text-sm font-semibold">{staffSize}</span>
          </label>
          <label className="block">
            <span className="text-xs text-white/60">Créances en retard (%)</span>
            <input
              type="range"
              min={0}
              max={50}
              value={overduePct}
              onChange={(e) => setOverduePct(Number(e.target.value))}
              className="w-full mt-2 accent-amber-400"
            />
            <span className="text-sm font-semibold">{overduePct} %</span>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3">
            <span className="text-sm text-white/70 flex items-center gap-2">
              <TrendingDown size={16} className="text-red-400" /> Risque pénalités fiscales
            </span>
            <span className="font-semibold">{formatMad(result.penaltyRiskMad)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3">
            <span className="text-sm text-white/70">Gap recouvrement</span>
            <span className="font-semibold">{formatMad(result.collectionGapMad)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3">
            <span className="text-sm text-white/70">Temps admin perdu</span>
            <span className="font-semibold">{formatMad(result.adminWasteMad)}</span>
          </div>

          {recommended && (
            <div className="mt-4 rounded-xl bg-amber-400/15 border border-amber-400/30 p-4">
              <p className="text-xs font-bold uppercase text-amber-200 tracking-wide flex items-center gap-1">
                <TrendingUp size={14} /> Plan recommandé
              </p>
              <p className="text-lg font-bold mt-1">{recommended.personaTitleFr.split('—')[0]?.trim()}</p>
              <p className="text-sm text-white/70">{formatPriceMadYear(recommended.plan.price)}</p>
              <button
                type="button"
                onClick={() => {
                  trackEvent('upgrade_clicked', { surface: 'roi_calculator', planId: result.recommendedPlan });
                  onSelectPlan?.(result.recommendedPlan);
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-[#0b1428] hover:bg-amber-300 transition-colors"
              >
                Choisir cette offre <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
