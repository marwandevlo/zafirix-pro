'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { isOwnerEmail, OWNER_EMAIL } from '@/app/lib/owner';
import { supabase } from '@/app/lib/supabase';
import { AdminAlert, AdminEmptyState, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';

type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  plan?: string;
  status?: string;
  created_at?: string;
  last_login?: string | null;
};

export default function UsersAdminClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [warning, setWarning] = useState<string>('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setWarning('');
      try {
        if (!isAtlasSupabaseDataEnabled()) {
          if (!cancelled) {
            setRows([]);
            setWarning('Local mode: users list is not available.');
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        if (!token) return;

        const sp = new URLSearchParams();
        if (q.trim()) sp.set('q', q.trim());
        if (roleFilter !== 'all') sp.set('role', roleFilter);
        if (planFilter !== 'all') sp.set('plan', planFilter);
        if (statusFilter !== 'all') sp.set('status', statusFilter);
        const url = `/api/admin/users${sp.toString() ? `?${sp.toString()}` : ''}`;

        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
              ? String((json as { error?: unknown }).error)
              : 'forbidden';
          setError(msg);
          return;
        }

        if (!cancelled) {
          const users =
            typeof json === 'object' && json && 'users' in json && Array.isArray((json as { users?: unknown }).users)
              ? ((json as { users: unknown[] }).users as AdminUserRow[])
              : [];
          setRows(users);
          const warn =
            typeof json === 'object' && json && 'warning' in json && typeof (json as { warning?: unknown }).warning === 'string'
              ? String((json as { warning?: unknown }).warning)
              : '';
          if (warn) setWarning(warn);
        }
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
  }, [planFilter, q, roleFilter, statusFilter]);

  const visible = useMemo(() => rows, [rows]);

  const mutateUser = async (id: string, patch: Record<string, unknown>, confirmText?: string) => {
    if (!isAtlasSupabaseDataEnabled()) return;
    if (confirmText) {
      const ok = window.confirm(confirmText);
      if (!ok) return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) return;
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const json: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: unknown }).error)
          : 'error';
      if (!res.ok) throw new Error(msg);
      // Reload list (keeps filters/search applied)
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: string) => {
    if (!isAtlasSupabaseDataEnabled()) return;
    const ok = window.confirm('Supprimer cet utilisateur ? Cette action est irréversible.');
    if (!ok) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) return;
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: unknown }).error)
          : 'error';
      if (!res.ok) throw new Error(msg);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell title="Admin · Users">
      <div className="space-y-4">
        {loading ? <AdminAlert variant="info">Chargement…</AdminAlert> : null}
        {error ? <AdminAlert variant="error">Unable to load users. {error}</AdminAlert> : null}
        {warning ? <AdminAlert variant="warning">{warning}</AdminAlert> : null}
      </div>

      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Users · المستخدمون</p>
          <p className="text-xs text-gray-500 mt-0.5">Search, filter, and moderate accounts.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100"
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-semibold hover:bg-emerald-100"
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('suspended')}
              className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100"
            >
              Suspended
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('banned')}
              className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs font-semibold hover:bg-red-100"
            >
              Banned
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50"
            >
              All
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email or name…"
              className="md:col-span-2 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
            >
              <option value="all">All roles</option>
              <option value="user">user</option>
              <option value="admin">admin</option>
              <option value="moderator">moderator</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
            >
              <option value="all">All status</option>
              <option value="pending">pending</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="banned">banned</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
            >
              <option value="all">All plans</option>
              <option value="free">free</option>
              <option value="pro">pro</option>
              <option value="vip">vip</option>
              <option value="enterprise">enterprise</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="px-6 py-6">
            <AdminTableSkeleton cols={8} rows={7} />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-8">
            <AdminEmptyState title="No users found" description="When users sign up, they’ll appear here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="text-left">
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">Plan</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Created</th>
                  <th className="px-6 py-4 font-semibold">Last login</th>
                  <th className="px-6 py-4 font-semibold">User ID</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 font-semibold">
                      <Link href={`/admin/users/${u.id}`} className="hover:underline">
                        {u.email || '—'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{u.role || 'user'}</td>
                    <td className="px-6 py-4 text-gray-700">{u.plan || '—'}</td>
                    <td className="px-6 py-4 text-gray-700">{u.status || '—'}</td>
                    <td className="px-6 py-4 text-gray-700">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-6 py-4 text-gray-700">{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-700">{u.id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {isOwnerEmail(u.email) ? (
                          <span className="text-xs font-semibold px-3 py-2 rounded-xl border bg-gray-50 text-gray-600 border-gray-200">
                            Owner protected
                          </span>
                        ) : null}
                        {String(u.status ?? '').toLowerCase() === 'pending' ? (
                          <button
                            onClick={() => mutateUser(u.id, { status: 'active' }, 'Approuver cet utilisateur ?')}
                            disabled={isOwnerEmail(u.email)}
                            className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-semibold hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          onClick={() => mutateUser(u.id, { status: 'suspended' }, 'Suspendre cet utilisateur ?')}
                          disabled={isOwnerEmail(u.email)}
                          className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => mutateUser(u.id, { status: 'active' })}
                          disabled={isOwnerEmail(u.email)}
                          className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-semibold hover:bg-emerald-100"
                        >
                          Activate
                        </button>
                        <button
                          onClick={() => mutateUser(u.id, { status: 'banned' }, 'Bannir cet utilisateur ?')}
                          disabled={isOwnerEmail(u.email)}
                          className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs font-semibold hover:bg-red-100"
                        >
                          {String(u.status ?? '').toLowerCase() === 'pending' ? 'Reject' : 'Ban'}
                        </button>
                        <button
                          onClick={() => deleteUser(u.id)}
                          disabled={isOwnerEmail(u.email)}
                          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50"
                        >
                          Delete
                        </button>
                      </div>
                      {isOwnerEmail(u.email) ? (
                        <p className="mt-2 text-[11px] text-gray-400">
                          Protected: {OWNER_EMAIL}
                        </p>
                      ) : null}
                    </td>
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

