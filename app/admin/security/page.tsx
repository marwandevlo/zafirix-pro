'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { Activity, AlertCircle, Shield, Gauge } from 'lucide-react';

type DepCheck = { name: string; status: string; latencyMs?: number; detail?: string };
type Metrics = {
  activeUsers24h: number;
  aiUsage24h: number;
  ocrUsage24h: number;
  documentUploads24h: number;
  apiErrors24h: number;
  quotaViolations24h: number;
  payrollRuns24h: number;
  bankImports24h: number;
};

export default function AdminSecurityPage() {
  const [deps, setDeps] = useState<DepCheck[]>([]);
  const [healthStatus, setHealthStatus] = useState('unknown');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [depRes, metRes] = await Promise.all([
          fetch('/api/health/dependencies'),
          fetch('/api/health/metrics'),
        ]);
        const depJson = await depRes.json();
        setHealthStatus(String(depJson.status ?? 'unknown'));
        setDeps(Array.isArray(depJson.dependencies) ? depJson.dependencies : []);
        if (metRes.ok) {
          const metJson = await metRes.json();
          setMetrics(metJson.metrics ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load_failed');
      }
    })();
  }, []);

  return (
    <AdminShell title="Sécurité & fiabilité">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Phase 16 — Security Dashboard</h1>
            <p className="text-sm text-gray-500">Health checks, quotas, audit coverage, alertes production.</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : null}

        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Activity className="w-4 h-4" /> Statut plateforme
            </div>
            <p className="text-3xl font-bold capitalize">{healthStatus}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Gauge className="w-4 h-4" /> Violations quota (24h)
            </div>
            <p className="text-3xl font-bold">{metrics?.quotaViolations24h ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <AlertCircle className="w-4 h-4" /> Erreurs audit (24h)
            </div>
            <p className="text-3xl font-bold">{metrics?.apiErrors24h ?? '—'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-900">Dépendances</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3">Latence</th>
                <th className="px-5 py-3">Détail</th>
              </tr>
            </thead>
            <tbody>
              {deps.map((d) => (
                <tr key={d.name} className="border-t border-gray-100">
                  <td className="px-5 py-3 font-medium">{d.name}</td>
                  <td className="px-5 py-3 capitalize">{d.status}</td>
                  <td className="px-5 py-3">{d.latencyMs != null ? `${d.latencyMs} ms` : '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{d.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {metrics ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Usage (24h)</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              {[
                ['Utilisateurs actifs', metrics.activeUsers24h],
                ['Requêtes IA', metrics.aiUsage24h],
                ['OCR', metrics.ocrUsage24h],
                ['Documents', metrics.documentUploads24h],
                ['Paie', metrics.payrollRuns24h],
                ['Banque', metrics.bankImports24h],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl bg-gray-50 p-4">
                  <p className="text-gray-500">{label}</p>
                  <p className="text-xl font-bold text-gray-900">{val}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs text-gray-400">
          Rapports détaillés : docs/PHASE16_SECURITY_AUDIT.md, PHASE16_RLS_AUDIT.md, PHASE16_RELEASE_READINESS.md
        </p>
      </div>
    </AdminShell>
  );
}
