'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, Zap } from 'lucide-react';
import {
  buildUsageUpsell,
  type UsageUpsellTrigger,
} from '@/app/lib/atlas-plan-modules';
import {
  getActivePlan,
  getEffectivePlanLimits,
  getUsage,
  refreshAtlasUsageState,
} from '@/app/lib/atlas-usage-limits';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { trackEvent } from '@/app/lib/analytics-track';

type UsageUpsellBannerProps = {
  className?: string;
};

export function UsageUpsellBanner({ className = '' }: UsageUpsellBannerProps) {
  const router = useRouter();
  const [trigger, setTrigger] = useState<UsageUpsellTrigger | null>(null);

  useEffect(() => {
    const evaluate = async () => {
      if (isAtlasSupabaseDataEnabled()) await refreshAtlasUsageState();
      const plan = getActivePlan();
      const planId = plan?.id ?? 'free-trial';
      const usage = getUsage();
      const limits = getEffectivePlanLimits(plan);

      const candidates = [
        buildUsageUpsell({ planId, metric: 'invoices', used: usage.invoices, limit: limits.invoices }),
        buildUsageUpsell({ planId, metric: 'operations', used: usage.operations, limit: limits.operations }),
        buildUsageUpsell({ planId, metric: 'companies', used: usage.companies, limit: limits.companies }),
        buildUsageUpsell({ planId, metric: 'users', used: usage.users, limit: limits.users }),
      ].filter(Boolean) as UsageUpsellTrigger[];

      const critical = candidates.find((c) => c.level === 'critical');
      const warning = candidates.find((c) => c.level === 'warning');
      setTrigger(critical ?? warning ?? null);
    };
    void evaluate();
    const onFocus = () => void evaluate();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (!trigger) return null;

  const isCritical = trigger.level === 'critical';

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
        isCritical ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      } ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {isCritical ? (
          <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
        ) : (
          <Zap className="text-amber-600 shrink-0 mt-0.5" size={18} />
        )}
        <div>
          <p className={`text-sm font-semibold ${isCritical ? 'text-red-900' : 'text-amber-900'}`}>
            {trigger.headlineFr}
          </p>
          <p className="text-xs text-slate-600 mt-0.5 max-w-lg">{trigger.valueFr}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          trackEvent('upgrade_clicked', {
            surface: 'usage_upsell',
            metric: trigger.metric,
            targetPlan: trigger.targetPlan,
          });
          router.push(trigger.ctaHref);
        }}
        className={`shrink-0 inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors ${
          isCritical ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
        }`}
      >
        Upgrade {trigger.targetPlan === 'enterprise' ? 'Ultimate' : 'Pro'}
        <ArrowUpRight size={14} />
      </button>
    </div>
  );
}
