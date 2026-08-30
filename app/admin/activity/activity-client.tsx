'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Clock, RefreshCw, Search, User, X } from 'lucide-react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { AdminAlert, AdminEmptyState, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import type { AdminActivityOverview, AdminUserActivityRow, UserActivityEntry } from '@/app/types/atlas-user-activity';

function PresenceBadge(props: { status: 'active' | 'offline' }) {
  if (props.status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <span aria-hidden>🟢</span> Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200">
      <span aria-hidden>⚪</span> Offline
    </span>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function ActivityModal(props: {
  user: AdminUserActivityRow | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<UserActivityEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!props.user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        if (!token) return;

        const res = await fetch(`/api/admin/activity/${props.user!.id}?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const json = (await res.json()) as { activities?: UserActivityEntry[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'load_failed');
        if (!cancelled) setActivities(Array.isArray(json.activities) ? json.activities : []);
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
  }, [props.user]);

  if (!props.user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <User size={16} /> {props.user.fullName || props.user.email || props.user.id}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{props.user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PresenceBadge status={props.user.status} />
              <span className="text-xs text-gray-500">
                {props.user.operationsToday} operation{props.user.operationsToday === 1 ? '' : 's'} today
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-50 text-xs text-gray-500 flex gap-4">
          <span className="flex items-center gap-1">
            <Clock size={12} /> Last seen: {formatWhen(props.user.lastSeenAt)}
          </span>
          <span>Last login: {formatWhen(props.user.lastLoginAt)}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-gray-500">Loading activity…</p>
          ) : error ? (
            <AdminAlert variant="error">{error}</AdminAlert>
          ) : activities.length === 0 ? (
            <AdminEmptyState title="No activity yet" description="Actions will appear here as the user works in Atlas." />
          ) : (
            <ul className="space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                  <p className="text-sm text-gray-900">{a.summary}</p>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                    <span className="font-mono uppercase tracking-wide">{a.actionType.replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <span>{formatWhen(a.createdAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Link
            href={`/admin/users/${props.user.id}`}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            User profile
          </Link>
          <button
            type="button"
            onClick={props.onClose}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActivityAdminClient() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [overview, setOverview] = useState<AdminActivityOverview | null>(null);
  const [selected, setSelected] = useState<AdminUserActivityRow | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isAtlasSupabaseDataEnabled()) {
      setOverview(null);
      setError('Local mode: activity tracking requires Supabase.');
      setLoading(false);
      return;
    }

    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) return;

      const sp = new URLSearchParams();
      if (q.trim()) sp.set('q', q.trim());
      const url = `/api/admin/activity${sp.toString() ? `?${sp.toString()}` : ''}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = (await res.json()) as AdminActivityOverview & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'forbidden');
      setOverview(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load({ silent: true }), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const users = useMemo(() => overview?.users ?? [], [overview]);

  return (
    <AdminShell title="Admin · Activity">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-indigo-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">User Activity & Real-Time Status</h2>
              <p className="text-sm text-gray-500">Monitor who is online and review recent operations (refreshes every 30s).</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}

        {overview ? (
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active now</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{overview.stats.activeNow}</p>
              <p className="text-xs text-gray-500 mt-1">Seen within last 5 minutes</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Users tracked</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{overview.stats.totalUsers}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operations today</p>
              <p className="text-3xl font-bold text-indigo-700 mt-1">{overview.stats.totalOperationsToday}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 min-w-0 w-full max-w-full overflow-x-visible">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Live user monitor</p>
          <div className="mt-4 relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-6">
            <AdminTableSkeleton cols={5} rows={8} />
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-8">
            <AdminEmptyState title="No users found" description="Try a different search or wait for user sign-ins." />
          </div>
        ) : (
          <div className="atlas-table-scroll">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="text-left">
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Ops today</th>
                  <th className="px-6 py-4 font-semibold">Last seen</th>
                  <th className="px-6 py-4 font-semibold">Recent operations</th>
                  <th className="px-6 py-4 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">{u.fullName || '—'}</p>
                      <p className="text-xs text-gray-500">{u.email || u.id}</p>
                    </td>
                    <td className="px-6 py-4">
                      <PresenceBadge status={u.status} />
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{u.operationsToday}</td>
                    <td className="px-6 py-4 text-gray-700 text-xs">{formatWhen(u.lastSeenAt)}</td>
                    <td className="px-6 py-4">
                      {u.recentActivities.length === 0 ? (
                        <span className="text-xs text-gray-400">No recent actions</span>
                      ) : (
                        <ul className="space-y-1 max-w-md">
                          {u.recentActivities.slice(0, 3).map((a) => (
                            <li key={a.id} className="text-xs text-gray-700 truncate" title={a.summary}>
                              {a.summary}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(u)}
                        className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-900 text-xs font-semibold hover:bg-indigo-100"
                      >
                        View all
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ActivityModal user={selected} onClose={() => setSelected(null)} />
    </AdminShell>
  );
}
