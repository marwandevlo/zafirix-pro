'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { todayYmd } from '@/app/lib/atlas-dates';
import { BadgeCheck, Ban, Clock } from 'lucide-react';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { adminAuthedFetch } from '@/app/lib/admin/admin-client-auth';
import AdminShell from '@/app/admin/_components/AdminShell';
import { AdminAlert } from '@/app/admin/_components/AdminUi';
import { AdminDataTable, AdminFilterChip, type AdminColumn } from '@/app/admin/_components/AdminDataTable';
import { AdminStatusBadge } from '@/app/admin/_components/AdminStatusBadge';

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError('');
      setLoading(true);
      try {
        if (isAtlasSupabaseDataEnabled()) {
          const res = await adminAuthedFetch('/api/admin/subscriptions', { method: 'GET' });
          const json = (await res.json().catch(() => ({}))) as {
            rows?: AdminSubRow[];
            error?: string;
            message?: string;
            hint?: string;
            code?: string;
          };
          if (!res.ok) {
            const parts = [json.message || json.error || 'db_error', json.hint, json.code ? `code=${json.code}` : '']
              .map((p) => String(p ?? '').trim())
              .filter(Boolean);
            throw new Error(parts.join(' · '));
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

  const setStatus = async (rowId: string, nextStatus: string) => {
    if (!isAtlasSupabaseDataEnabled()) {
      setError('Mode Supabase requis.');
      return;
    }
    setError('');
    setBusyId(rowId);
    try {
      const res = await adminAuthedFetch('/api/admin/subscriptions', {
        method: 'PATCH',
        body: JSON.stringify({ id: rowId, status: nextStatus }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        hint?: string;
        code?: string;
      };
      if (!res.ok) {
        const parts = [json.message || json.error || 'db_error', json.hint, json.code ? `code=${json.code}` : '']
          .map((p) => String(p ?? '').trim())
          .filter(Boolean);
        throw new Error(parts.join(' · '));
      }
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, status: nextStatus } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  };

  const columns: AdminColumn<AdminSubRow>[] = [
    {
      key: 'user_id',
      header: 'User',
      sortValue: (p) => p.user_id,
      className: 'font-mono text-[11px] whitespace-nowrap',
      render: (p) => p.user_id,
    },
    {
      key: 'email',
      header: 'Email',
      sortValue: (p) => p.email,
      render: (p) => <span className="font-semibold text-[#0F1F3D]">{p.email || '—'}</span>,
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (p) => p.plan,
      render: (p) => p.plan || '—',
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (p) => String(p.status),
      render: (p) => <AdminStatusBadge value={String(p.status)} />,
    },
    {
      key: 'created',
      header: 'Created',
      sortValue: (p) => p.created_at,
      className: 'whitespace-nowrap text-slate-500',
      render: (p) => toYmdFromIso(p.created_at),
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (p) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => void setStatus(p.id, 'active')}
            disabled={busyId === p.id}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 disabled:opacity-40"
          >
            <BadgeCheck size={12} /> Approve
          </button>
          <button
            type="button"
            onClick={() => void setStatus(p.id, 'canceled')}
            disabled={busyId === p.id}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200 disabled:opacity-40"
          >
            <Ban size={12} /> Reject
          </button>
          <select
            value={String(p.status ?? '')}
            onChange={(e) => void setStatus(p.id, e.target.value)}
            disabled={busyId === p.id}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold disabled:opacity-40"
          >
            <option value="pending_manual">pending_manual</option>
            <option value="active">active</option>
            <option value="canceled">canceled</option>
          </select>
        </div>
      ),
    },
  ];

  return (
    <AdminShell title="Subscriptions">
      {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="flex items-center justify-between text-[11px] text-slate-500">
            Pending <Clock size={14} className="text-amber-600" />
          </p>
          <p className="mt-1 text-2xl font-bold text-[#0F1F3D]">{stats.pending}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="flex items-center justify-between text-[11px] text-slate-500">
            Active <BadgeCheck size={14} className="text-emerald-600" />
          </p>
          <p className="mt-1 text-2xl font-bold text-[#0F1F3D]">{stats.active}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="flex items-center justify-between text-[11px] text-slate-500">
            Canceled <Ban size={14} className="text-rose-600" />
          </p>
          <p className="mt-1 text-2xl font-bold text-[#0F1F3D]">{stats.canceled}</p>
        </div>
      </div>
      <AdminDataTable
        rows={filtered}
        columns={columns}
        rowKey={(p) => p.id}
        loading={loading}
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="Email, plan, user id…"
        emptyTitle="Aucun enregistrement"
        emptyDescription="Aucun abonnement pour ce filtre."
        minWidthClass="min-w-[980px]"
        toolbar={
          <>
            {([
              { id: 'pending' as const, label: `Pending (${stats.pending})` },
              { id: 'active' as const, label: `Active (${stats.active})` },
              { id: 'canceled' as const, label: `Canceled (${stats.canceled})` },
              { id: 'all' as const, label: `All (${stats.total})` },
            ]).map((t) => (
              <AdminFilterChip key={t.id} active={filter === t.id} onClick={() => setFilter(t.id)}>
                {t.label}
              </AdminFilterChip>
            ))}
          </>
        }
      />
    </AdminShell>
  );
}

