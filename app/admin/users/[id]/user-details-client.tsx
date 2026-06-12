'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { isOwnerEmail, OWNER_EMAIL } from '@/app/lib/owner';
import { supabase } from '@/app/lib/supabase';
import { AdminAlert, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';

type UserDetail = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  role: string;
  plan: string;
  status: string;
  created_at: string | null;
  last_login: string | null;
};

type AtlasSubscriptionRow = {
  id: unknown;
  plan_id: unknown;
  status: unknown;
  start_date: unknown;
  end_date: unknown;
  created_at: unknown;
};

type AdminLogRow = {
  id: unknown;
  created_at: unknown;
  action: unknown;
  details: unknown;
};

export default function UserDetailsAdminClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<UserDetail | null>(null);
  const [subs, setSubs] = useState<AtlasSubscriptionRow[]>([]);
  const [logs, setLogs] = useState<AdminLogRow[]>([]);

  const [role, setRole] = useState('user');
  const [plan, setPlan] = useState('free');
  const [status, setStatus] = useState('active');
  const [fullName, setFullName] = useState('');

  const reload = async () => {
    if (!isAtlasSupabaseDataEnabled()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) {
        router.push(`/login?next=${encodeURIComponent(`/admin/users/${id}`)}`);
        return;
      }
      const res = await fetch(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: unknown }).error)
          : 'error';
      if (!res.ok) throw new Error(msg);

      const u =
        typeof json === 'object' && json && 'user' in json && (json as { user?: unknown }).user
          ? ((json as { user: unknown }).user as UserDetail)
          : null;
      setUser(u);

      const subscriptions =
        typeof json === 'object' && json && 'subscriptions' in json && Array.isArray((json as { subscriptions?: unknown }).subscriptions)
          ? ((json as { subscriptions: unknown[] }).subscriptions as AtlasSubscriptionRow[])
          : [];
      setSubs(subscriptions);

      const adminLogs =
        typeof json === 'object' && json && 'adminLogs' in json && Array.isArray((json as { adminLogs?: unknown }).adminLogs)
          ? ((json as { adminLogs: unknown[] }).adminLogs as AdminLogRow[])
          : [];
      setLogs(adminLogs);

      setRole(String(u?.role ?? 'user'));
      setPlan(String(u?.plan ?? 'free'));
      setStatus(String(u?.status ?? 'active'));
      setFullName(String(u?.full_name ?? ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    if (!isAtlasSupabaseDataEnabled()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) return;
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role, plan, status, full_name: fullName }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      const body = (typeof json === 'object' && json ? json : {}) as { error?: unknown; message?: unknown };
      const msg =
        typeof body.message === 'string' && body.message
          ? body.message
          : typeof body.error === 'string'
            ? body.error
            : 'error';
      if (!res.ok) throw new Error(msg);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const del = async () => {
    if (!isAtlasSupabaseDataEnabled()) return;
    const ok = window.confirm('Supprimer cet utilisateur ? Cette action est irréversible.');
    if (!ok) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) return;
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const json: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: unknown }).error)
          : 'error';
      if (!res.ok) throw new Error(msg);
      router.push('/admin/users');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const createdLabel = useMemo(() => {
    if (!user?.created_at) return '—';
    const d = new Date(user.created_at);
    return Number.isNaN(d.getTime()) ? user.created_at : d.toLocaleString();
  }, [user?.created_at]);

  const protectedOwner = isOwnerEmail(user?.email ?? null);

  return (
    <AdminShell title="Admin · User details">
      {loading ? <AdminAlert variant="info">Chargement…</AdminAlert> : null}
      {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}

      {!user ? (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <AdminTableSkeleton cols={2} rows={6} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500">User</p>
                  <p className="text-lg font-extrabold text-gray-900 mt-1">{user.email || '—'}</p>
                  <p className="text-xs text-gray-500 mt-1 font-mono">{user.id}</p>
                  {protectedOwner ? (
                    <p className="text-xs text-gray-500 mt-2">
                      Owner protected: <span className="font-semibold">{OWNER_EMAIL}</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push('/admin/users')}
                    className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={del}
                    disabled={protectedOwner}
                    className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs font-semibold hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Full name</p>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <div className="mt-1 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 text-gray-800">{createdLabel}</div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Role</p>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={protectedOwner}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                    <option value="moderator">moderator</option>
                    <option value="owner">owner</option>
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Plan</p>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    disabled={protectedOwner}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="vip">vip</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={protectedOwner}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
                  >
                    <option value="pending">pending (en attente)</option>
                    <option value="active">active (validé)</option>
                    <option value="suspended">suspended</option>
                    <option value="banned">banned</option>
                  </select>
                  {status === 'pending' ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      Sélectionnez « active » puis « Save changes » pour valider ce compte.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-end">
                  <button
                    onClick={save}
                    disabled={protectedOwner}
                    className="w-full px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-xs font-semibold hover:bg-blue-100"
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Subscriptions</p>
                <p className="text-xs text-gray-500 mt-0.5">Latest 25 from `atlas_subscriptions`.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr className="text-left">
                      <th className="px-6 py-4 font-semibold">Plan</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Start</th>
                      <th className="px-6 py-4 font-semibold">End</th>
                      <th className="px-6 py-4 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                          No subscriptions.
                        </td>
                      </tr>
                    ) : (
                      subs.map((s) => (
                        <tr key={String(s.id)} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-6 py-4 text-gray-900 font-semibold">{String(s.plan_id ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{String(s.status ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{String(s.start_date ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{String(s.end_date ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{s.created_at ? new Date(String(s.created_at)).toLocaleString() : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Admin logs</p>
                <p className="text-xs text-gray-500 mt-0.5">Actions targeting this user.</p>
              </div>
              <div className="px-6 py-4 space-y-3">
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-500">No admin actions yet.</p>
                ) : (
                  logs.map((l) => (
                    <div key={String(l.id)} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">{l.created_at ? new Date(String(l.created_at)).toLocaleString() : ''}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1">{String(l.action ?? '')}</p>
                      <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap wrap-break-word">{JSON.stringify(l.details ?? {}, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

