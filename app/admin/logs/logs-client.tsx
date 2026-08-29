'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { AdminDataTable, type AdminColumn } from '@/app/admin/_components/AdminDataTable';
import { AdminStatusBadge } from '@/app/admin/_components/AdminStatusBadge';
import { AdminAlert } from '@/app/admin/_components/AdminUi';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';

type LogRow = {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  details: unknown;
  created_at: string;
};

function actionTone(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('ban') || a.includes('delete') || a.includes('error')) return 'error';
  if (a.includes('suspend') || a.includes('reject')) return 'pending';
  if (a.includes('approv') || a.includes('activ')) return 'active';
  return action;
}

export default function AdminLogsClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!isAtlasSupabaseDataEnabled()) return;
      setLoading(true);
      setError('');
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        if (!token) return;

        const res = await fetch('/api/admin/logs', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json: unknown = await res.json().catch(() => ({}));
        const errMsg =
          typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
            ? String((json as { error?: unknown }).error)
            : 'Erreur';
        if (!res.ok) throw new Error(errMsg);
        const logs =
          typeof json === 'object' && json && 'logs' in json && Array.isArray((json as { logs?: unknown }).logs)
            ? ((json as { logs: unknown[] }).logs as LogRow[])
            : [];
        if (!cancelled) setRows(logs);
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
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.action} ${r.admin_id} ${r.target_user_id ?? ''} ${JSON.stringify(r.details ?? {})}`
        .toLowerCase()
        .includes(needle),
    );
  }, [q, rows]);

  const columns: AdminColumn<LogRow>[] = [
    {
      key: 'created_at',
      header: 'Date',
      sortValue: (r) => new Date(r.created_at || 0).getTime(),
      className: 'whitespace-nowrap text-slate-500',
      render: (r) => (r.created_at ? new Date(r.created_at).toLocaleString('fr-MA') : '—'),
    },
    {
      key: 'action',
      header: 'Action',
      sortValue: (r) => r.action,
      render: (r) => <AdminStatusBadge value={actionTone(r.action)} label={r.action} />,
    },
    {
      key: 'admin_id',
      header: 'Admin',
      sortValue: (r) => r.admin_id,
      className: 'font-mono text-xs whitespace-nowrap',
      render: (r) => r.admin_id,
    },
    {
      key: 'target_user_id',
      header: 'Target',
      sortValue: (r) => r.target_user_id ?? '',
      className: 'font-mono text-xs whitespace-nowrap',
      render: (r) => r.target_user_id ?? '—',
    },
    {
      key: 'details',
      header: 'Details',
      className: 'min-w-[18rem]',
      render: (r) => (
        <pre className="max-w-[28rem] overflow-x-auto whitespace-pre font-mono text-[11px] text-slate-500">
          {JSON.stringify(r.details ?? {}, null, 2)}
        </pre>
      ),
    },
  ];

  return (
    <AdminShell title="Logs">
      {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}
      <p className="text-sm text-slate-500">Journal des actions privilégiées — rôles, bans, suppressions.</p>
      <AdminDataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="Action, admin UUID, cible…"
        emptyTitle="Aucun log"
        emptyDescription="Les changements de rôle, bans et suppressions apparaîtront ici."
        minWidthClass="min-w-[1100px]"
      />
    </AdminShell>
  );
}
