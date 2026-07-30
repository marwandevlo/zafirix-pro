'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Link2,
  Loader2,
  MessageSquareHeart,
  Plus,
  Star,
  TrendingUp,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { copyTextToClipboard } from '@/app/lib/copy-to-clipboard';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type {
  AtlasFeedbackRequest,
  FeedbackDashboard,
  FeedbackTrendPoint,
} from '@/app/types/atlas-client-feedback';
import {
  CHANNEL_LABELS,
  REQUEST_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/app/types/atlas-client-feedback';

type Tab = 'dashboard' | 'requests' | 'responses';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-800',
  opened: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-800',
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function NpsGauge({ nps }: { nps: number | null }) {
  if (nps == null) return <span className="text-gray-400">—</span>;
  const color = nps >= 50 ? 'text-green-600' : nps >= 0 ? 'text-amber-600' : 'text-red-600';
  return <span className={`text-2xl font-bold ${color}`}>{nps > 0 ? `+${nps}` : nps}</span>;
}

function TrendBars({ trends }: { trends: FeedbackTrendPoint[] }) {
  if (trends.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">Pas encore de tendances.</p>;
  }
  const maxNps = Math.max(...trends.map((t) => Math.abs(t.nps ?? 0)), 1);

  return (
    <div className="flex items-end gap-3 h-32 pt-4">
      {trends.map((t) => {
        const h = t.nps != null ? Math.max(8, (Math.abs(t.nps) / maxNps) * 100) : 8;
        const positive = (t.nps ?? 0) >= 0;
        return (
          <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-500">{t.nps ?? '—'}</span>
            <div
              className={`w-full rounded-t ${positive ? 'bg-indigo-500' : 'bg-red-400'}`}
              style={{ height: `${h}%` }}
            />
            <span className="text-[10px] text-gray-400">{t.month.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SatisfactionClientPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [requests, setRequests] = useState<AtlasFeedbackRequest[]>([]);
  const [summary, setSummary] = useState<FeedbackDashboard['summary']>({
    totalRequests: 0, completed: 0, pending: 0, responseRate: 0,
    avgSatisfaction: null, nps: null, promoters: 0, passives: 0, detractors: 0,
  });
  const [trends, setTrends] = useState<FeedbackTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subjectLabel: '', clientName: '', clientEmail: '' });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<FeedbackDashboard>(
      `/api/client-feedback?companyId=${encodeURIComponent(cid)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
      setRequests([]);
    } else {
      setRequests(result.data.requests ?? []);
      setSummary(result.data.summary ?? {
        totalRequests: 0, completed: 0, pending: 0, responseRate: 0,
        avgSatisfaction: null, nps: null, promoters: 0, passives: 0, detractors: 0,
      });
      setTrends(result.data.trends ?? []);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid);
    })();
  }, [load]);

  useEffect(() => {
    return onCompanySwitched(() => {
      void (async () => {
        const cid = await getActiveCompanyDbRowId();
        setCompanyId(cid);
        if (cid) await load(cid);
      })();
    });
  }, [load]);

  const handleCreate = async () => {
    if (!companyId || !form.subjectLabel.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/client-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'create_request',
          companyId,
          sourceType: 'manual',
          subjectLabel: form.subjectLabel,
          clientName: form.clientName || undefined,
          clientEmail: form.clientEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'create_failed');
      setShowForm(false);
      setForm({ subjectLabel: '', clientName: '', clientEmail: '' });
      await load(companyId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur création.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async (url: string | null) => {
    if (!url) return;
    await copyTextToClipboard(url);
  };

  const completedRequests = requests.filter((r) => r.response);

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquareHeart className="h-6 w-6 text-indigo-600" />
                <h1 className="text-xl font-semibold text-gray-900">Satisfaction client</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                NPS, notes de satisfaction et commentaires — liens QuickShareHub pour vos clients.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Nouvelle demande
            </button>
          </div>

          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="la satisfaction client" />}
          {loadError && <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">NPS</p>
              <NpsGauge nps={summary.nps} />
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500" /> Satisfaction moy.
              </p>
              <p className="text-2xl font-semibold">
                {summary.avgSatisfaction != null ? `${summary.avgSatisfaction}/5` : '—'}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Taux de réponse</p>
              <p className="text-2xl font-semibold">{summary.responseRate}%</p>
              <p className="text-[10px] text-gray-400">{summary.completed}/{summary.totalRequests} réponses</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Promoteurs / Détracteurs</p>
              <p className="text-lg font-semibold text-green-700">{summary.promoters}</p>
              <p className="text-lg font-semibold text-red-600">{summary.detractors}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>Tendances</TabButton>
            <TabButton active={tab === 'requests'} onClick={() => setTab('requests')}>Demandes</TabButton>
            <TabButton active={tab === 'responses'} onClick={() => setTab('responses')}>Réponses</TabButton>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : tab === 'dashboard' ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-2">
                  <TrendingUp className="h-4 w-4" /> Évolution NPS (6 mois)
                </h3>
                <TrendBars trends={trends} />
              </div>
              <div className="bg-white rounded-xl border p-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Répartition NPS</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-700">Promoteurs (9–10)</span>
                    <span className="font-medium">{summary.promoters}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700">Passifs (7–8)</span>
                    <span className="font-medium">{summary.passives}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-700">Détracteurs (0–6)</span>
                    <span className="font-medium">{summary.detractors}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : tab === 'responses' ? (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Sujet</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Satisfaction</th>
                    <th className="px-4 py-3">NPS</th>
                    <th className="px-4 py-3">Commentaire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {completedRequests.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune réponse.</td></tr>
                  ) : completedRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {r.response ? new Date(r.response.submittedAt).toLocaleDateString('fr-MA') : '—'}
                      </td>
                      <td className="px-4 py-3">{r.subjectLabel}</td>
                      <td className="px-4 py-3">{r.clientName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-0.5 text-amber-600">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          {r.response?.satisfactionScore}/5
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{r.response?.npsScore}/10</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={r.response?.comment ?? ''}>
                        {r.response?.comment ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Sujet</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Lien</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune demande.</td></tr>
                  ) : requests.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {new Date(r.createdAt).toLocaleDateString('fr-MA')}
                      </td>
                      <td className="px-4 py-3">{r.subjectLabel}</td>
                      <td className="px-4 py-3">{SOURCE_TYPE_LABELS[r.sourceType]}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[r.status]}`}>
                          {REQUEST_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">{CHANNEL_LABELS[r.channel]}</td>
                      <td className="px-4 py-3">
                        {r.shareUrl && r.status !== 'completed' ? (
                          <button
                            type="button"
                            onClick={() => void copyLink(r.shareUrl)}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs"
                          >
                            <Link2 className="h-3 w-3" /> Copier
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                <h2 className="text-lg font-semibold">Nouvelle demande d&apos;avis</h2>
                <label className="block">
                  <span className="text-xs text-gray-500">Sujet *</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.subjectLabel}
                    onChange={(e) => setForm({ ...form, subjectLabel: e.target.value })}
                    placeholder="Ex. Clôture projet Q2"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Client</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Email client</span>
                  <input
                    type="email"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg">
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !form.subjectLabel.trim()}
                    onClick={() => void handleCreate()}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50"
                  >
                    {submitting ? 'Création…' : 'Créer le lien'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
