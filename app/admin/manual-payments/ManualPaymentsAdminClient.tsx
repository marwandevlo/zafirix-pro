'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import type { ManualSubscriptionRow } from '@/app/api/admin/manual-subscriptions/route';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === 'pending_manual' || s === 'pending') {
    return 'bg-amber-100 text-amber-900 border-amber-200';
  }
  if (s === 'active' || s === 'paid') {
    return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  }
  if (s === 'canceled' || s === 'cancelled' || s === 'rejected') {
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }
  return 'bg-gray-100 text-gray-800 border-gray-200';
}

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending_manual' || s === 'pending') return 'En attente';
  if (s === 'active' || s === 'paid') return 'Payé / actif';
  if (s === 'canceled' || s === 'cancelled' || s === 'rejected') return 'Refusé';
  return status || '—';
}

function providerLabel(provider: string | null | undefined, method: string): string {
  const p = String(provider ?? '').toLowerCase();
  if (p === 'cashplus') return 'CashPlus';
  if (p === 'wafacash') return 'WafaCash';
  if (p === 'western_union') return 'Western Union';
  return method || 'manuel';
}

function isPendingRow(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'pending_manual' || s === 'pending';
}

export default function ManualPaymentsAdminClient() {
  const router = useRouter();
  const [rows, setRows] = useState<ManualSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending_manual' | 'active' | 'canceled'>('pending_manual');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) {
        setError('Session requise.');
        return;
      }
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/admin/manual-subscriptions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: ManualSubscriptionRow[];
        error?: string;
        message?: string;
        hint?: string;
      };
      if (!res.ok) {
        const parts = [json.message || json.error || 'Erreur', json.hint].filter(Boolean);
        setError(parts.join(' · '));
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, kind: 'activate' | 'reject') => {
    setBusyId(id);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) return;
      const url =
        kind === 'activate' ? '/api/admin/manual-subscriptions/activate' : '/api/admin/manual-subscriptions/reject';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(json.message || json.error || 'Action impossible');
        return;
      }
      router.refresh();
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Paiements manuels (Maroc)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Demandes créées depuis <span className="font-mono">/payment</span> → table{' '}
            <span className="font-mono">atlas_payment_requests</span>. Activer ou refuser après contrôle.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-500 flex flex-col gap-1">
            Statut
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm font-medium text-gray-800 min-w-[160px]"
            >
              <option value="all">Tous</option>
              <option value="pending_manual">En attente</option>
              <option value="active">Payés / actifs</option>
              <option value="canceled">Refusés</option>
            </select>
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1 min-w-[200px]">
            Recherche email
            <span className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ex. societe@..."
                className="w-full border border-gray-200 rounded-lg pl-8 pr-2 py-2 text-sm"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{error}</div> : null}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Montant</th>
                <th className="px-4 py-3 font-semibold">Canal</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Aucune ligne pour ce filtre.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.user_email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-800">
                      <span className="font-semibold">{r.plan_label}</span>
                      <span className="text-xs text-gray-400 ml-1 font-mono">{r.plan}</span>
                      {r.notes ? <div className="text-[11px] text-indigo-600 mt-0.5">{r.notes}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap">
                      {Number(r.amount_mad || 0).toLocaleString('fr-MA')} {r.currency || 'MAD'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {providerLabel(r.manual_provider, r.payment_method)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isPendingRow(r.status) ? (
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void act(r.id, 'activate')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check size={14} /> Activer
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void act(r.id, 'reject')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-800 text-xs font-bold hover:bg-rose-50 disabled:opacity-50"
                          >
                            <X size={14} /> Refuser
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
