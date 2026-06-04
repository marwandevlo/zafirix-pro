'use client';

import { useEffect, useState } from 'react';
import { Building2, AlertTriangle, FileText, Receipt, Users } from 'lucide-react';
import Link from 'next/link';
import type { ConsolidatedDashboard } from '@/app/types/atlas-workspace';

function bandColor(band: string): string {
  if (band === 'healthy') return 'text-green-700 bg-green-50';
  if (band === 'critical') return 'text-red-700 bg-red-50';
  return 'text-amber-700 bg-amber-50';
}

export function ConsolidatedDashboardWidget() {
  const [data, setData] = useState<ConsolidatedDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/cabinet/consolidated', { credentials: 'include' });
        const json = await res.json();
        if (!cancelled && json.ok) setData(json.dashboard);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse h-40" aria-busy />
    );
  }

  if (!data || data.companyCount === 0) return null;

  const kpis = [
    { label: 'Sociétés', value: data.companyCount, icon: Building2, color: 'text-blue-600' },
    { label: 'Factures', value: data.totalInvoices, icon: FileText, color: 'text-amber-600' },
    { label: 'Alertes TVA', value: data.totalTvaAlerts, icon: Receipt, color: 'text-red-600' },
    { label: 'Paie (brouillons)', value: data.totalPayrollDrafts, icon: Users, color: 'text-purple-600' },
    { label: 'Alertes totales', value: data.totalAlerts, icon: AlertTriangle, color: 'text-orange-600' },
    { label: 'Readiness moy.', value: `${data.avgReadiness}%`, icon: Building2, color: 'text-emerald-600' },
  ];

  return (
    <section className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Vue consolidée — Cabinet</h2>
          <p className="text-xs text-gray-500">{data.companyCount} société(s) · Santé moy. {data.avgHealth}%</p>
        </div>
        <Link href="/cabinet" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          Portfolio →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
            <k.icon size={14} className={`${k.color} mb-1`} />
            <p className="text-lg font-bold text-gray-900">{k.value}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k.label}</p>
          </div>
        ))}
      </div>
      {data.companies.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-2">Client</th>
                <th className="py-2 pr-2">Readiness</th>
                <th className="py-2 pr-2">Santé</th>
                <th className="py-2">Alertes</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.slice(0, 5).map((c) => (
                <tr key={c.companyId} className="border-b border-gray-50">
                  <td className="py-2 pr-2 font-medium text-gray-800">{c.name}</td>
                  <td className="py-2 pr-2">{c.readiness}%</td>
                  <td className="py-2 pr-2">
                    <span className={`px-1.5 py-0.5 rounded ${bandColor(c.health >= 80 ? 'healthy' : c.health >= 60 ? 'attention' : 'critical')}`}>
                      {c.health}%
                    </span>
                  </td>
                  <td className="py-2">{c.alerts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
