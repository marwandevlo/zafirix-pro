'use client';

import { useEffect, useState } from 'react';
import { FileText, ScanLine, Truck, Users } from 'lucide-react';
import { fetchFreemiumSnapshot } from '@/app/lib/atlas-freemium-client';
import type { FreemiumMeter, FreemiumMeterSnapshot, FreemiumSnapshot } from '@/app/lib/atlas-freemium';
import { FreemiumUpgradeModal } from '@/app/components/billing/FreemiumUpgradeModal';

const ICONS: Record<FreemiumMeter, typeof FileText> = {
  invoices: FileText,
  cod: Truck,
  ai_scans: ScanLine,
  team: Users,
};

function barClass(meter: FreemiumMeterSnapshot): string {
  if (meter.exceeded) return 'bg-rose-500';
  if (meter.percent !== null && meter.percent >= 0.8) return 'bg-amber-500';
  return 'bg-cyan-500';
}

export function FreemiumUsageWidget() {
  const [snapshot, setSnapshot] = useState<FreemiumSnapshot | null>(null);
  const [upgradeMeter, setUpgradeMeter] = useState<FreemiumMeter | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchFreemiumSnapshot();
      if (!cancelled) setSnapshot(next);
    };
    void load();
    const onFocus = () => {
      void load();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">Crédits ce mois-ci</p>
        <p className="text-xs text-slate-400 mt-1">Chargement de l’usage…</p>
      </div>
    );
  }

  const blocked = snapshot.meters.find((m) => m.exceeded);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#0F1F3D]">Crédits ce mois-ci</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Forfait {snapshot.plan === 'pro' ? 'Pro' : 'Gratuit'} · {snapshot.periodYm}
          </p>
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
            snapshot.plan === 'pro' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {snapshot.plan === 'pro' ? 'Pro' : 'Free'}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {snapshot.meters.map((meter) => {
          const Icon = ICONS[meter.meter];
          const remainingLabel = meter.unlimited
            ? 'Illimité'
            : `${meter.remaining ?? 0} restant${(meter.remaining ?? 0) > 1 ? 's' : ''}`;
          return (
            <button
              key={meter.meter}
              type="button"
              onClick={() => {
                if (meter.exceeded && snapshot.plan === 'free') setUpgradeMeter(meter.meter);
              }}
              className="w-full text-left rounded-xl border border-slate-100 p-3 hover:border-slate-200"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 text-[#0F1F3D] flex items-center justify-center">
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{meter.label}</p>
                    <p className="text-xs text-slate-400">
                      {meter.unlimited ? 'Illimité' : `${meter.used} / ${meter.limit}`} · {remainingLabel}
                    </p>
                  </div>
                </div>
                {meter.percent !== null && (
                  <span className="text-xs font-semibold text-slate-500">{Math.round(meter.percent * 100)}%</span>
                )}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-1.5 ${barClass(meter)}`}
                  style={{ width: meter.unlimited ? '28%' : `${Math.round((meter.percent ?? 0) * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
        {snapshot.plan === 'free' && blocked && (
          <p className="text-xs text-rose-600">Une limite est atteinte. Cliquez pour passer à Pro.</p>
        )}
      </div>
      <FreemiumUpgradeModal
        open={Boolean(upgradeMeter)}
        meter={upgradeMeter ?? undefined}
        used={snapshot.meters.find((m) => m.meter === upgradeMeter)?.used}
        limit={snapshot.meters.find((m) => m.meter === upgradeMeter)?.limit}
        onClose={() => setUpgradeMeter(null)}
      />
    </div>
  );
}
