'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { AdminAlert, AdminEmptyState, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';
import { TableScroll } from '@/app/components/ui/TableScroll';

type LogRow = {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  details: unknown;
  created_at: string;
};

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

        const sp = new URLSearchParams();
        if (q.trim()) sp.set('q', q.trim());
        const res = await fetch(`/api/admin/logs${sp.toString() ? `?${sp.toString()}` : ''}`, {
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
  }, [q]);

  const visible = useMemo(() => rows, [rows]);

  return (
    <AdminShell title="Admin · Logs">
      <div className="space-y-4">
        {loading ? <AdminAlert variant="info">Chargement…</AdminAlert> : null}
        {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}
      </div>

      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-w-0">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Admin logs</p>
          <p className="text-xs text-gray-500 mt-0.5">Every privileged action should appear here.</p>
          <div className="mt-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search action/admin/target…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-6">
            <AdminTableSkeleton cols={5} rows={8} />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-8">
            <AdminEmptyState title="No logs yet" description="Actions like role changes, bans, and deletions will appear here." />
          </div>
        ) : (
          <TableScroll>
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="text-left">
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Action</th>
                  <th className="px-6 py-4 font-semibold">Admin</th>
                  <th className="px-6 py-4 font-semibold">Target</th>
                  <th className="px-6 py-4 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-700">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{r.action}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-700 whitespace-nowrap">{r.admin_id}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-700 whitespace-nowrap">{r.target_user_id ?? '—'}</td>
                    <td className="px-6 py-4 min-w-[16rem]">
                      <pre className="text-xs text-gray-700 whitespace-pre max-w-[36rem]">
                        {JSON.stringify(r.details ?? {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    </AdminShell>
  );
}

