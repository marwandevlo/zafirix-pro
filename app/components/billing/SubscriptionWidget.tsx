'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Sparkles, Building2, AlertTriangle } from 'lucide-react';
import type { BillingUsageSummary, PlanCode } from '@/app/types/atlas-billing';
import { FEATURE_LABELS_FR } from '@/app/types/atlas-billing';
import { UpgradeModal } from '@/app/components/billing/UpgradeModal';

export function SubscriptionWidget() {
  const [summary, setSummary] = useState<BillingUsageSummary | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/usage', { credentials: 'include' });
      const json = await res.json();
      if (json.ok) setSummary(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse h-36" />;
  }

  if (!summary) return null;

  const planCode = (summary.subscription?.planCode ?? 'FREE') as PlanCode;
  const topQuotas = summary.quotas.filter((q) => !q.unlimited).slice(0, 3);

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Abonnement</h2>
          </div>
          <Link href="/billing" className="text-xs text-indigo-600 hover:underline">Détails →</Link>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-medium">{summary.subscription?.planName ?? 'Free'}</span>
          <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700">{summary.subscription?.status ?? 'trial'}</span>
          {summary.trialDaysRemaining !== null && summary.trialDaysRemaining >= 0 && (
            <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800">
              {summary.trialExpired ? 'Essai expiré' : `${summary.trialDaysRemaining}j d'essai`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {topQuotas.map((q) => (
            <div key={q.featureCode} className="rounded-lg bg-gray-50 px-2 py-1.5 text-xs">
              <p className="text-gray-500 truncate">{FEATURE_LABELS_FR[q.featureCode]}</p>
              <p className="font-semibold text-gray-800">{q.used}/{q.limit ?? '∞'}</p>
            </div>
          ))}
        </div>
        {summary.trialExpired && (
          <p className="text-xs text-red-700 flex items-center gap-1">
            <AlertTriangle size={12} /> Essai terminé — upgrade recommandé
          </p>
        )}
        <button
          type="button"
          onClick={() => setUpgradeOpen(true)}
          className="w-full py-2 text-sm font-medium rounded-lg bg-[#0F1F3D] text-white hover:bg-[#1B2A4A] flex items-center justify-center gap-1"
        >
          <Sparkles size={14} /> Upgrade
        </button>
      </section>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlanCode={planCode}
        onSelectPlan={() => { setUpgradeOpen(false); void reload(); }}
      />
    </>
  );
}

export function SubscriptionWidgetCompact() {
  return (
    <Link href="/billing" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50">
      <Building2 size={14} className="text-indigo-600" />
      <span>Facturation</span>
    </Link>
  );
}
