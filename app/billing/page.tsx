'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCw, ArrowUpRight } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { UpgradeModal } from '@/app/components/billing/UpgradeModal';
import type { AtlasSubscriptionPlan, BillingUsageSummary, PlanCode } from '@/app/types/atlas-billing';
import { FEATURE_LABELS_FR, ATLAS_FEATURE_CODES } from '@/app/types/atlas-billing';

export default function BillingPage() {
  const [summary, setSummary] = useState<BillingUsageSummary | null>(null);
  const [plans, setPlans] = useState<AtlasSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [usageRes, plansRes] = await Promise.all([
        fetch('/api/billing/usage', { credentials: 'include' }),
        fetch('/api/billing/plans', { credentials: 'include' }),
      ]);
      const usage = await usageRes.json();
      const plansJson = await plansRes.json();
      if (usage.ok) setSummary(usage);
      if (plansJson.ok) setPlans(plansJson.plans ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const exportRows = useMemo(() => {
    if (!summary) return [];
    return summary.quotas.map((q) => ({
      feature: FEATURE_LABELS_FR[q.featureCode],
      used: q.used,
      limit: q.limit ?? 'illimité',
      remaining: q.remaining ?? 'illimité',
    }));
  }, [summary]);

  const exportColumns: ExportColumn[] = [
    { key: 'feature', label: 'Fonctionnalité' },
    { key: 'used', label: 'Utilisé' },
    { key: 'limit', label: 'Limite' },
    { key: 'remaining', label: 'Restant' },
  ];

  const planCode = (summary?.subscription?.planCode ?? 'FREE') as PlanCode;

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <CreditCard size={20} /> Facturation & abonnement
            </h1>
            <p className="text-sm text-gray-500">Plan, essai, usage et limites — sans paiement intégré</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu
              filename="atlas-billing-usage"
              title="Usage Atlas"
              columns={exportColumns}
              data={exportRows}
            />
            <button type="button" onClick={() => void reload()} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
              <RefreshCw size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl">
          {loading ? (
            <p className="text-gray-500">Chargement…</p>
          ) : summary ? (
            <>
              <section className="grid sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs text-gray-500 uppercase">Plan</p>
                  <p className="text-xl font-bold text-gray-900">{summary.subscription?.planName ?? 'Free'}</p>
                  <p className="text-sm text-gray-500">{summary.subscription?.planCode}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs text-gray-500 uppercase">Statut</p>
                  <p className="text-xl font-bold text-gray-900 capitalize">{summary.subscription?.status ?? '—'}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs text-gray-500 uppercase">Essai restant</p>
                  <p className="text-xl font-bold text-gray-900">
                    {summary.trialDaysRemaining === null ? '—' : summary.trialExpired ? 'Expiré' : `${summary.trialDaysRemaining} j`}
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Usage & quotas</h2>
                  <button
                    type="button"
                    onClick={() => setUpgradeOpen(true)}
                    className="text-sm text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    Upgrade <ArrowUpRight size={14} />
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2">Fonctionnalité</th>
                      <th className="px-4 py-2">Utilisé</th>
                      <th className="px-4 py-2">Limite</th>
                      <th className="px-4 py-2">Restant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.quotas.map((q) => (
                      <tr key={q.featureCode} className="border-t border-gray-50">
                        <td className="px-4 py-2">{FEATURE_LABELS_FR[q.featureCode]}</td>
                        <td className="px-4 py-2">{q.used}</td>
                        <td className="px-4 py-2">{q.unlimited ? '∞' : q.limit}</td>
                        <td className="px-4 py-2">
                          <span className={!q.allowed ? 'text-red-600 font-medium' : ''}>
                            {q.unlimited ? '∞' : q.remaining}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="font-semibold text-gray-900 mb-3">Offres disponibles</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {plans.map((p) => (
                    <div key={p.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-gray-500 text-xs mb-2">{p.monthlyPrice.toLocaleString()} {p.currency}/mois</p>
                      <p className="text-xs text-gray-600 line-clamp-2">{p.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <p className="text-gray-500">Impossible de charger la facturation.</p>
          )}
        </div>
      </main>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlanCode={planCode}
        onSelectPlan={() => { setUpgradeOpen(false); void reload(); }}
      />
    </div>
  );
}
