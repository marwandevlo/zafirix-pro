'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getActivePlan, getTrialCountdown, refreshAtlasUsageState } from '@/app/lib/atlas-usage-limits';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { trackEvent } from '@/app/lib/analytics-track';
import { isOwnerSessionFlagSet } from '@/app/lib/owner';

export function TrialUpgradeBanner() {
  const router = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      if (isAtlasSupabaseDataEnabled()) await refreshAtlasUsageState();
      setTick((x) => x + 1);
    };
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const tc = useMemo(() => {
    void tick;
    return getTrialCountdown();
  }, [tick]);
  const plan = useMemo(() => {
    void tick;
    return getActivePlan();
  }, [tick]);
  if (isOwnerSessionFlagSet()) return null;
  if (!tc.isTrial) return null;

  const days = tc.isTrial ? tc.daysLeft : null;
  const subline =
    days !== null
      ? days === 0
        ? "Dernier jour d'essai — passez à Pro pour débloquer volumes, utilisateurs et opérations sans blocage."
        : `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''} — la version Pro retire les plafonds qui freinent votre cabinet ou votre PME.`
      : 'Essai gratuit actif — Passez à la version Pro pour débloquer tout le potentiel de ZAFIRIX PRO.';

  return (
    <div className="rounded-xl border border-amber-200 bg-linear-to-r from-amber-50 to-orange-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-amber-400/90 flex items-center justify-center text-[#0F1F3D]">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-950">Passez à la version Pro</p>
          <p className="text-xs text-amber-900/80 mt-0.5">{subline}</p>
          {plan?.name ? <p className="text-[11px] text-amber-800/70 mt-1">Forfait actuel : {plan.name}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            trackEvent('trial_banner_clicked', { surface: 'trial_banner', target: 'pricing' });
            trackEvent('upgrade_clicked', { surface: 'trial_banner', target: 'pricing' });
            router.push('/pricing');
          }}
          className="px-4 py-2 rounded-lg bg-[#0F1F3D] text-white text-xs font-semibold hover:bg-[#1a3060]"
        >
          Voir les offres Pro
        </button>
        <button
          type="button"
          onClick={() => {
            trackEvent('trial_banner_clicked', { surface: 'trial_banner', target: 'subscription' });
            trackEvent('upgrade_clicked', { surface: 'trial_banner', target: 'subscription' });
            router.push('/subscription');
          }}
          className="px-4 py-2 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-950 hover:bg-amber-50"
        >
          Mon abonnement
        </button>
      </div>
    </div>
  );
}
