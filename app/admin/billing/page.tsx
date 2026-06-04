'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import type { AtlasSubscriptionPlan } from '@/app/types/atlas-billing';
import { ATLAS_FEATURE_CODES, FEATURE_LABELS_FR } from '@/app/types/atlas-billing';

export default function AdminBillingPage() {
  const [plans, setPlans] = useState<AtlasSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/billing/plans', { credentials: 'include' });
      const json = await res.json();
      if (json.ok) setPlans(json.plans ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <AdminShell title="Billing — Plans & limites">
      <div className="space-y-6">
        <p className="text-sm text-gray-600">
          Catalogue commercial Phase 15 — config-driven depuis la base. Paiements non intégrés.
        </p>
        {loading ? (
          <p className="text-gray-500">Chargement…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Mensuel</th>
                  <th className="px-4 py-3">Annuel</th>
                  {ATLAS_FEATURE_CODES.map((fc) => (
                    <th key={fc} className="px-3 py-3 whitespace-nowrap">{FEATURE_LABELS_FR[fc]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-3">{p.monthlyPrice} {p.currency}</td>
                    <td className="px-4 py-3">{p.yearlyPrice} {p.currency}</td>
                    {ATLAS_FEATURE_CODES.map((fc) => (
                      <td key={fc} className="px-3 py-3 text-center">
                        {p.features[fc] === null ? '∞' : p.features[fc]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
