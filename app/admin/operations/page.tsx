'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { AdminDataTable, type AdminColumn } from '@/app/admin/_components/AdminDataTable';
import { AdminStatusBadge } from '@/app/admin/_components/AdminStatusBadge';
import {
  Activity, AlertCircle, BarChart3, Database, Gauge, HeartPulse, Route, Shield, Users,
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

type JourneySummary = { pass: number; warn: number; fail: number };
type JourneyCheck = { id: string; area: string; severity: string; title: string; detail?: string };

export default function AdminOperationsPage() {
  const [deps, setDeps] = useState<DepCheck[]>([]);
  const [healthStatus, setHealthStatus] = useState('unknown');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [journey, setJourney] = useState<{ ok: boolean; summary: JourneySummary; fails: JourneyCheck[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [depRes, metRes, statsRes, auditRes, diagRes] = await Promise.all([
          fetch('/api/health/dependencies'),
          fetch('/api/health/metrics'),
          fetch('/api/admin/dashboard-stats'),
          fetch('/api/audit/stats'),
          fetch('/api/admin/diagnose'),
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
        if (diagRes.ok) {
          const diagJson = await diagRes.json();
          const report = diagJson.report as {
            ok: boolean;
            summary: JourneySummary;
            checks: JourneyCheck[];
          } | undefined;
          if (report?.summary) {
            setJourney({
              ok: !!report.ok,
              summary: report.summary,
              fails: (report.checks ?? []).filter((c) => c.severity === 'fail').slice(0, 8),
            });
          }
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

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Route className="w-4 h-4 text-cyan-700" /> Journey diagnose (client + admin)
            </div>
            {journey ? (
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  journey.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {journey.summary.pass} pass · {journey.summary.warn} warn · {journey.summary.fail} fail
              </span>
            ) : (
              <span className="text-xs text-gray-400">Chargement…</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Routes, tables usage/logistique, règles ICE/TVA, RPC quotas — via{' '}
            <code className="text-[11px] bg-gray-50 px-1 rounded">/api/admin/diagnose</code>
          </p>
          {journey?.fails?.length ? (
            <AdminDataTable
              rows={journey.fails}
              columns={
                [
                  { key: 'area', header: 'Area', sortValue: (f) => f.area, render: (f) => f.area },
                  {
                    key: 'severity',
                    header: 'Status',
                    sortValue: (f) => f.severity,
                    render: (f) => <AdminStatusBadge value={f.severity} />,
                  },
                  { key: 'title', header: 'Check', sortValue: (f) => f.title, render: (f) => f.title },
                  { key: 'detail', header: 'Detail', render: (f) => <span className="text-xs text-slate-500">{f.detail ?? '—'}</span> },
                ] satisfies AdminColumn<JourneyCheck>[]
              }
              rowKey={(f) => f.id}
              emptyTitle="Aucun échec"
              pageSize={8}
              minWidthClass="min-w-[720px]"
              searchPlaceholder="Filtrer un check…"
            />
          ) : journey ? (
            <p className="text-sm text-emerald-700 font-medium">Aucun échec dur détecté sur le parcours critique.</p>
          ) : null}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Database className="w-4 h-4" /> Dépendances
            </div>
            <AdminDataTable
              rows={deps}
              columns={
                [
                  { key: 'name', header: 'Service', sortValue: (d) => d.name, render: (d) => <span className="font-medium">{d.name}</span> },
                  { key: 'status', header: 'Status', sortValue: (d) => d.status, render: (d) => <AdminStatusBadge value={d.status} /> },
                  {
                    key: 'latency',
                    header: 'Latency',
                    sortValue: (d) => d.latencyMs ?? 0,
                    className: 'tabular-nums text-slate-500',
                    render: (d) => (d.latencyMs != null ? `${d.latencyMs} ms` : '—'),
                  },
                  { key: 'detail', header: 'Detail', render: (d) => <span className="text-xs text-slate-500">{d.detail ?? '—'}</span> },
                ] satisfies AdminColumn<DepCheck>[]
              }
              rowKey={(d) => d.name}
              emptyTitle="Aucune dépendance"
              pageSize={8}
              minWidthClass="min-w-[640px]"
            />
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
          <a href="/admin/security" className="text-indigo-600 hover:underline">/admin/security</a>
          {' · '}
          CLI <code className="text-[11px]">npm run simulate:journey -- --db</code>.
        </p>
      </div>
    </AdminShell>
  );
}
