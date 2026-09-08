'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { adminAuthedFetch, fetchAdminBearerToken } from '@/app/lib/admin/admin-client-auth';
import { isOwnerEmail, getOwnerEmail } from '@/app/lib/owner';
import { AdminAlert } from '@/app/admin/_components/AdminUi';
import { AdminDataTable, AdminFilterChip, type AdminColumn } from '@/app/admin/_components/AdminDataTable';
import { AdminStatusBadge } from '@/app/admin/_components/AdminStatusBadge';
import { useDebouncedValue } from '@/app/lib/use-debounced-value';
import { UserApprovalRow } from '@/app/admin/users/_components/UserApprovalRow';
import { UserPlanOverrideModal } from '@/app/admin/users/_components/UserPlanOverrideModal';
import type { AdminEntitlementSnapshot } from '@/app/lib/admin/admin-entitlement-types';

type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  plan?: string;
  status?: string;
  created_at?: string;
  last_login?: string | null;
  last_seen_at?: string | null;
  is_active_now?: boolean;
  operations_today?: number;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  trial_ends_at?: string | null;
  trial_expired?: boolean;
  trial_label?: string;
  admin_override?: boolean;
  documents_used?: number;
  documents_limit?: number | null;
};

export default function UsersAdminClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [warning, setWarning] = useState<string>('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 350);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planModalUser, setPlanModalUser] = useState<AdminUserRow | null>(null);

  const loadUsers = useCallback(async (cancelledRef?: { current: boolean }, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    setError('');
    setWarning('');
    try {
      if (!isAtlasSupabaseDataEnabled()) {
        if (!cancelledRef?.current) {
          setRows([]);
          setWarning('Local mode: users list is not available.');
        }
        return;
      }

      await fetchAdminBearerToken();

      const sp = new URLSearchParams();
      if (debouncedQ.trim()) sp.set('q', debouncedQ.trim());
      if (roleFilter !== 'all') sp.set('role', roleFilter);
      if (planFilter !== 'all') sp.set('plan', planFilter);
      if (statusFilter !== 'all') sp.set('status', statusFilter);
      const url = `/api/admin/users${sp.toString() ? `?${sp.toString()}` : ''}`;

      const res = await adminAuthedFetch(url);
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
            ? String((json as { error?: unknown }).error)
            : 'forbidden';
        if (!cancelledRef?.current) setError(msg);
        return;
      }

      if (!cancelledRef?.current) {
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
      if (!cancelledRef?.current) setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      if (!cancelledRef?.current && !silent) setLoading(false);
    }
  }, [planFilter, debouncedQ, roleFilter, statusFilter]);

  useEffect(() => {
    const cancelled = { current: false };
    void loadUsers(cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [loadUsers]);

  const visible = useMemo(() => rows, [rows]);

  const mutateUser = async (userId: string, patch: Record<string, unknown>, confirmText?: string) => {
    if (!isAtlasSupabaseDataEnabled()) {
      setError('Mode Supabase requis pour modérer les utilisateurs.');
      return;
    }
    if (confirmText) {
      const ok = window.confirm(confirmText);
      if (!ok) return;
    }
    setBusyUserId(userId);
    setError('');
    try {
      const res = await adminAuthedFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        user?: AdminUserRow & { full_name?: string };
      };
      const msg = json.message || json.error || 'error';
      if (!res.ok) throw new Error(msg);

      if (json.user) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === userId
              ? {
                  ...r,
                  role: json.user?.role ?? r.role,
                  plan: json.user?.plan ?? r.plan,
                  status: json.user?.status ?? r.status,
                  email: json.user?.email ?? r.email,
                }
              : r,
          ),
        );
      } else {
        setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, ...patch } : r)));
      }

      router.refresh();
      await loadUsers(undefined, { silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusyUserId(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!isAtlasSupabaseDataEnabled()) {
      setError('Mode Supabase requis pour supprimer un utilisateur.');
      return;
    }
    const ok = window.confirm('Supprimer cet utilisateur ? Cette action est irréversible.');
    if (!ok) return;
    setBusyUserId(userId);
    setError('');
    try {
      const res = await adminAuthedFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const json: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: unknown }).error)
          : 'error';
      if (!res.ok) throw new Error(msg);
      setRows((prev) => prev.filter((r) => r.id !== userId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusyUserId(null);
    }
  };

  const columns: AdminColumn<AdminUserRow>[] = [
    {
      key: 'email',
      header: 'Email',
      sortValue: (u) => u.email,
      render: (u) => (
        <Link href={`/admin/users/${u.id}`} className="font-semibold text-[#0F1F3D] hover:underline">
          {u.email || '—'}
        </Link>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortValue: (u) => u.role || 'user',
      render: (u) => <AdminStatusBadge value={u.role || 'user'} />,
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (u) => u.plan || '',
      render: (u) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[#0F1F3D]">{u.plan || '—'}</span>
          <span className="text-[11px] text-slate-500">{u.subscription_plan || u.subscription_status || '—'}</span>
        </div>
      ),
    },
    {
      key: 'subscription',
      header: 'Subscription',
      sortValue: (u) => u.subscription_status || '',
      render: (u) => (
        <div className="flex flex-col gap-0.5">
          <AdminStatusBadge value={u.subscription_status} />
          {u.admin_override ? <AdminStatusBadge value="override" label="admin grant" /> : null}
        </div>
      ),
    },
    {
      key: 'trial',
      header: 'Trial',
      sortValue: (u) => (u.trial_expired ? 0 : u.trial_ends_at ? Date.parse(u.trial_ends_at) : 1),
      render: (u) => (
        <span className={`text-[12px] ${u.trial_expired ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>
          {u.trial_label || (u.trial_expired ? 'Essai expiré' : '—')}
        </span>
      ),
    },
    {
      key: 'docs',
      header: 'Docs quota',
      sortValue: (u) => u.documents_used ?? 0,
      render: (u) => {
        const used = u.documents_used ?? 0;
        const limit = u.documents_limit;
        return (
          <span className="tabular-nums text-[12px] font-semibold text-slate-700">
            {limit === null || limit === undefined ? `${used} / ∞` : `${used} / ${limit}`}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (u) => u.status || '',
      render: (u) => (
        <AdminStatusBadge
          value={u.status}
          label={String(u.status ?? '').toLowerCase() === 'active' ? 'approved' : undefined}
        />
      ),
    },
    {
      key: 'presence',
      header: 'Presence',
      sortValue: (u) => (u.is_active_now ? 1 : 0),
      render: (u) => <AdminStatusBadge value={u.is_active_now ? 'active' : 'offline'} />,
    },
    {
      key: 'ops',
      header: 'Ops',
      sortValue: (u) => u.operations_today ?? 0,
      render: (u) => <span className="tabular-nums font-semibold">{u.operations_today ?? 0}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      sortValue: (u) => new Date(u.created_at || 0).getTime(),
      className: 'whitespace-nowrap text-slate-500',
      render: (u) => (u.created_at ? new Date(u.created_at).toLocaleDateString('fr-MA') : '—'),
    },
    {
      key: 'id',
      header: 'User ID',
      sortValue: (u) => u.id,
      className: 'font-mono text-[11px] whitespace-nowrap text-slate-400',
      render: (u) => u.id,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (u) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isOwnerEmail(u.email) ? (
            <span className="text-[11px] text-slate-400">Protected {getOwnerEmail()}</span>
          ) : null}
          <button
            type="button"
            onClick={() => setPlanModalUser(u)}
            disabled={busyUserId === u.id}
            className="h-8 rounded-lg bg-indigo-50 px-2.5 text-[11px] font-semibold text-indigo-800 ring-1 ring-indigo-200 disabled:opacity-40"
          >
            Plan / quotas
          </button>
          {String(u.status ?? '').toLowerCase() === 'pending' ? (
            <UserApprovalRow
              user={u}
              showStatus={false}
              busy={busyUserId === u.id}
              onBusyChange={(busy) => setBusyUserId(busy ? u.id : null)}
              onApproved={(approved) => {
                setRows((prev) =>
                  prev.map((r) => (r.id === u.id ? { ...r, status: approved.status, email: approved.email || r.email } : r)),
                );
                setSuccess('Compte approuvé. L’e-mail de notification a été mis en file.');
                window.setTimeout(() => setSuccess(''), 4000);
                router.refresh();
              }}
              onError={(message) => setError(message)}
            />
          ) : null}
          <button
            type="button"
            onClick={() => void mutateUser(u.id, { status: 'suspended' }, 'Suspendre cet utilisateur ?')}
            disabled={isOwnerEmail(u.email) || busyUserId === u.id}
            className="h-8 rounded-lg bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 disabled:opacity-40"
          >
            Suspend
          </button>
          <button
            type="button"
            onClick={() => void mutateUser(u.id, { status: 'active' })}
            disabled={isOwnerEmail(u.email) || busyUserId === u.id}
            className="h-8 rounded-lg bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 disabled:opacity-40"
          >
            Activate
          </button>
          <button
            type="button"
            onClick={() =>
              void mutateUser(
                u.id,
                { status: 'rejected' },
                String(u.status ?? '').toLowerCase() === 'pending'
                  ? 'Rejeter cette demande ?'
                  : 'Bannir cet utilisateur ?',
              )
            }
            disabled={isOwnerEmail(u.email) || busyUserId === u.id}
            className="h-8 rounded-lg bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200 disabled:opacity-40"
          >
            {String(u.status ?? '').toLowerCase() === 'pending' ? 'Reject' : 'Ban'}
          </button>
          <button
            type="button"
            onClick={() => void deleteUser(u.id)}
            disabled={isOwnerEmail(u.email) || busyUserId === u.id}
            className="h-8 rounded-lg bg-white px-2.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell title="Users">
      {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}
      {success ? <AdminAlert variant="info">{success}</AdminAlert> : null}
      {warning ? <AdminAlert variant="warning">{warning}</AdminAlert> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          Comptes, abonnements, essais et quotas documents. Accordez un plan gratuit, prolongez un essai ou réinitialisez les quotas.
        </p>
        <Link href="/admin/activity" className="text-xs font-semibold text-cyan-700 hover:underline">
          Activity monitor →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="all">All roles</option>
          <option value="user">user</option>
          <option value="admin">admin</option>
          <option value="moderator">moderator</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="all">All plans</option>
          <option value="free">free</option>
          <option value="pro">pro</option>
          <option value="vip">vip</option>
          <option value="enterprise">enterprise</option>
        </select>
      </div>
      <AdminDataTable
        rows={visible}
        columns={columns}
        rowKey={(u) => u.id}
        loading={loading}
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="Email or name…"
        emptyTitle="No users found"
        emptyDescription="When users sign up, they’ll appear here."
        minWidthClass="min-w-[1400px]"
        toolbar={
          <>
            {(['all', 'pending', 'active', 'suspended', 'banned'] as const).map((s) => (
              <AdminFilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {s}
              </AdminFilterChip>
            ))}
          </>
        }
      />
      {planModalUser ? (
        <UserPlanOverrideModal
          userId={planModalUser.id}
          email={planModalUser.email}
          onClose={() => setPlanModalUser(null)}
          onSaved={(snapshot: AdminEntitlementSnapshot) => {
            setRows((prev) =>
              prev.map((r) =>
                r.id === planModalUser.id
                  ? {
                      ...r,
                      plan: snapshot.profilePlan,
                      admin_override: snapshot.adminOverride,
                      subscription_status: snapshot.workspace.status,
                      subscription_plan: snapshot.workspace.planCode,
                      trial_ends_at: snapshot.workspace.trialEndsAt,
                      trial_expired: snapshot.trialExpired,
                      trial_label: snapshot.trialLabelFr,
                      documents_used: snapshot.documents.used,
                      documents_limit: snapshot.documents.limit,
                    }
                  : r,
              ),
            );
            setSuccess('Plan / quotas mis à jour. L’accès documentaire respecte désormais cet override.');
            window.setTimeout(() => setSuccess(''), 4000);
            setPlanModalUser(null);
            router.refresh();
          }}
        />
      ) : null}
    </AdminShell>
  );
}

