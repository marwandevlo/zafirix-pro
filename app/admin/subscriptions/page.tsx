'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { todayYmd } from '@/app/lib/atlas-dates';
import { ArrowLeft, BadgeCheck, Ban, Clock, Filter, ShieldCheck } from 'lucide-react';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';

type SubStatus = 'pending_manual' | 'active' | 'canceled' | string;

type AdminSubRow = {
  id: string;
  user_id: string;
  email: string;
  plan: string;
  status: SubStatus;
  created_at: string;
  updated_at?: string;
};

function statusBadge(status: string): { label: string; cls: string } {
  const s = String(status ?? '').toLowerCase();
  if (s === 'pending_manual' || s === 'pending') return { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  if (s === 'active') return { label: 'Active', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  if (s === 'canceled' || s === 'cancelled' || s === 'rejected') return { label: 'Canceled', cls: 'bg-red-50 text-red-800 border-red-200' };
  return { label: s || '—', cls: 'bg-gray-50 text-gray-700 border-gray-200' };
}

function toYmdFromIso(iso: string): string {
  // safe fallback for malformed timestamps
  if (!iso) return todayYmd();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayYmd();
  return todayYmd(d);
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<AdminSubRow[]>([]);
  const [filter, setFilter] = useState<'pending' | 'active' | 'canceled' | 'all'>('pending');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError('');
      setLoading(true);
      try {
        if (isAtlasSupabaseDataEnabled()) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token ?? '';
          if (!token) {
            router.push('/login?next=/admin/subscriptions');
            return;
          }

          const res = await fetch('/api/admin/subscriptions', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = (await res.json().catch(() => ({}))) as { rows?: AdminSubRow[]; error?: string; message?: string };
          if (!res.ok) {
            const msg = process.env.NODE_ENV === 'development' ? (json.message || json.error || 'db_error') : 'db_error';
            throw new Error(msg);
          }
          const list = Array.isArray(json.rows) ? json.rows : [];

          if (!cancelled) setRows(list);
          return;
        }

        router.push('/access-denied');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => String(r.status).toLowerCase() === 'pending_manual').length;
    const active = rows.filter((r) => String(r.status).toLowerCase() === 'active').length;
    const canceled = rows.filter((r) => ['canceled', 'cancelled', 'rejected'].includes(String(r.status).toLowerCase())).length;
    return { pending, active, canceled, total: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return rows.filter((r) => {
      const s = String(r.status ?? '').toLowerCase();
      if (filter !== 'all') {
        if (filter === 'pending' && s !== 'pending_manual') return false;
        if (filter === 'active' && s !== 'active') return false;
        if (filter === 'canceled' && !['canceled', 'cancelled', 'rejected'].includes(s)) return false;
      }
      if (qv) {
        const hay = `${r.email} ${r.plan} ${r.user_id}`.toLowerCase();
        if (!hay.includes(qv)) return false;
      }
      return true;
    });
  }, [filter, q, rows]);

  const setStatus = async (id: string, nextStatus: string) => {
    if (!isAtlasSupabaseDataEnabled()) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) {
        router.push('/login?next=/admin/subscriptions');
        return;
      }
      const res = await fetch('/api/admin/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        const msg = process.env.NODE_ENV === 'development' ? (json.message || json.error || 'db_error') : 'db_error';
        throw new Error(msg);
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={16} /> Dashboard
          </button>
          <span className="text-gray-200">/</span>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={18} /> Admin · Subscriptions
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        {loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            Chargement…
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Pending</p>
              <Clock size={16} className="text-amber-600" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900 mt-2">{stats.pending}</p>
            <p className="text-xs text-gray-400 mt-1">Status: pending_manual</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Active</p>
              <BadgeCheck size={16} className="text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900 mt-2">{stats.active}</p>
            <p className="text-xs text-gray-400 mt-1">Status: active</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Canceled</p>
              <Ban size={16} className="text-red-600" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900 mt-2">{stats.canceled}</p>
            <p className="text-xs text-gray-400 mt-1">Status: canceled</p>
          </div>
        </div>

        {/* Filters + Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Subscriptions</p>
              <p className="text-xs text-gray-500 mt-0.5">Source: Supabase table <span className="font-mono">public.subscriptions</span></p>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 mr-2">
                <Filter size={14} /> Filtre
              </div>
              {([
                { id: 'pending', label: `Pending (${stats.pending})` },
                { id: 'active', label: `Active (${stats.active})` },
                { id: 'canceled', label: `Canceled (${stats.canceled})` },
                { id: 'all', label: `All (${stats.total})` },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    filter === t.id ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-4 border-b border-gray-100">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email / plan / user id…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="text-left">
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Plan</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Created</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                      Aucun enregistrement pour ce filtre.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const badge = statusBadge(p.status);
                    return (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-xs text-gray-700">{p.user_id}</td>
                        <td className="px-6 py-4 text-gray-900 font-semibold">{p.email || '—'}</td>
                        <td className="px-6 py-4 text-gray-700">{p.plan || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{toYmdFromIso(p.created_at)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setStatus(p.id, 'active')}
                              className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 flex items-center gap-2"
                              title="Approve"
                            >
                              <BadgeCheck size={14} /> Approve
                            </button>
                            <button
                              onClick={() => setStatus(p.id, 'canceled')}
                              className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-semibold hover:bg-red-100 flex items-center gap-2"
                              title="Reject"
                            >
                              <Ban size={14} /> Reject
                            </button>
                            <select
                              value={String(p.status ?? '')}
                              onChange={(e) => setStatus(p.id, e.target.value)}
                              className="px-2 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700"
                              title="Change status"
                            >
                              <option value="pending_manual">pending_manual</option>
                              <option value="active">active</option>
                              <option value="canceled">canceled</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

