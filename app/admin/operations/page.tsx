'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import {
  Activity, AlertCircle, BarChart3, Database, Gauge, HeartPulse, Shield, Users,
} from 'lucide-react';

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
type DashboardStats = {
  subscriptions?: { total?: number; trial?: number; active?: number };
  companies?: { total?: number };
  users?: { total?: number; active?: number };
  paymentRequests?: { pending?: number; paid?: number };
};

export default function AdminOperationsPage() {
  const [deps, setDeps] = useState<DepCheck[]>([]);
  const [healthStatus, setHealthStatus] = useState('unknown');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [depRes, metRes, statsRes, auditRes] = await Promise.all([
          fetch('/api/health/dependencies'),
          fetch('/api/health/metrics'),
          fetch('/api/admin/dashboard-stats'),
          fetch('/api/audit/stats'),
        ]);
        const depJson = await depRes.json();
        setHealthStatus(String(depJson.status ?? 'unknown'));
        setDeps(Array.isArray(depJson.dependencies) ? depJson.dependencies : []);
        if (metRes.ok) {
          const metJson = await metRes.json();
          setMetrics(metJson.metrics ?? null);
        }
        if (statsRes.ok) {
          setStats(await statsRes.json());
        }
        if (auditRes.ok) {
          const auditJson = await auditRes.json();
          setAuditCount(typeof auditJson.total === 'number' ? auditJson.total : null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load_failed');
      }
    })();
  }, []);

  const statusColor = (s: string) => {
    if (s === 'ok' || s === 'healthy') return 'text-emerald-600 bg-emerald-50';
    if (s === 'degraded') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <AdminShell title="Opérations">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <HeartPulse className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Phase 19 — Operations Center</h1>
            <p className="text-sm text-gray-500">Santé, erreurs, usage, quotas et couverture audit — admin only.</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : null}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Activity className="w-4 h-4" /> Santé plateforme
            </div>
            <p className={`inline-flex px-3 py-1 rounded-full text-sm font-bold capitalize ${statusColor(healthStatus)}`}>
              {healthStatus}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <AlertCircle className="w-4 h-4" /> Erreurs API (24h)
            </div>
            <p className="text-3xl font-bold">{metrics?.apiErrors24h ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Gauge className="w-4 h-4" /> Violations quota (24h)
            </div>
            <p className="text-3xl font-bold">{metrics?.quotaViolations24h ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Shield className="w-4 h-4" /> Événements audit
            </div>
            <p className="text-3xl font-bold">{auditCount ?? '—'}</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b font-semibold text-gray-800 flex items-center gap-2">
              <Database className="w-4 h-4" /> Dépendances
            </div>
            <ul className="divide-y">
              {deps.map((d) => (
                <li key={d.name} className="px-5 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{d.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${statusColor(d.status)}`}>
                    {d.status}
                    {d.latencyMs != null ? ` · ${d.latencyMs}ms` : ''}
                  </span>
                </li>
              ))}
              {deps.length === 0 ? <li className="px-5 py-6 text-gray-400 text-sm">Chargement…</li> : null}
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b font-semibold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Usage (24h)
            </div>
            <dl className="grid grid-cols-2 gap-px bg-gray-100">
              {[
                ['Utilisateurs actifs', metrics?.activeUsers24h],
                ['Requêtes IA', metrics?.aiUsage24h],
                ['OCR', metrics?.ocrUsage24h],
                ['Documents uploadés', metrics?.documentUploads24h],
                ['Paie runs', metrics?.payrollRuns24h],
                ['Imports banque', metrics?.bankImports24h],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-white px-5 py-4">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-xl font-bold text-gray-900">{val ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4">
            <Users className="w-4 h-4" /> Plateforme & abonnements
          </div>
          <div className="grid sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{stats?.users?.total ?? '—'}</p>
              <p className="text-xs text-gray-500">Utilisateurs</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.companies?.total ?? '—'}</p>
              <p className="text-xs text-gray-500">Sociétés</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.subscriptions?.active ?? '—'}</p>
              <p className="text-xs text-gray-500">Abonnements actifs</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.subscriptions?.trial ?? '—'}</p>
              <p className="text-xs text-gray-500">Essais</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Accès restreint administrateurs. Voir aussi{' '}
          <a href="/admin/security" className="text-indigo-600 hover:underline">/admin/security</a>.
        </p>
      </div>
    </AdminShell>
  );
}
