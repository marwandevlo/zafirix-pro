'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { AdminAlert, AdminEmptyState, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';

type AdminCompanyRow = {
  id: string;
  userId?: string;
  name?: string;
  createdAt?: string;
  planId?: string;
};

export default function CompaniesAdminClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AdminCompanyRow[]>([]);
  const [warning, setWarning] = useState('');

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
            setWarning('Local mode: companies list is not available.');
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        if (!token) return;

        const res = await fetch('/api/admin/companies', { headers: { Authorization: `Bearer ${token}` } });
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
          const companies =
            typeof json === 'object' && json && 'companies' in json && Array.isArray((json as { companies?: unknown }).companies)
              ? ((json as { companies: unknown[] }).companies as AdminCompanyRow[])
              : [];
          setRows(companies);
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
  }, []);

  return (
    <AdminShell title="Admin · Companies">
      <div className="space-y-4">
        {loading ? <AdminAlert variant="info">Chargement…</AdminAlert> : null}
        {error ? <AdminAlert variant="error">Unable to load companies. {error}</AdminAlert> : null}
        {warning ? <AdminAlert variant="warning">{warning}</AdminAlert> : null}
      </div>

      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 min-w-0 w-full max-w-full overflow-x-visible">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Companies · الشركات</p>
          <p className="text-xs text-gray-500 mt-0.5">Owner, company name, created date, plan (when available).</p>
        </div>
        {loading ? (
          <div className="px-6 py-6">
            <AdminTableSkeleton cols={5} rows={7} />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-8">
            <AdminEmptyState title="No companies found" description="Once companies are created, they’ll show up here." />
          </div>
        ) : (
          <div className="atlas-table-scroll">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="text-left">
                  <th className="px-6 py-4 font-semibold">Company</th>
                  <th className="px-6 py-4 font-semibold">Plan</th>
                  <th className="px-6 py-4 font-semibold">Created</th>
                  <th className="px-6 py-4 font-semibold">Owner</th>
                  <th className="px-6 py-4 font-semibold">Company ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 font-semibold">{c.name || '—'}</td>
                    <td className="px-6 py-4 text-gray-700">{c.planId || '—'}</td>
                    <td className="px-6 py-4 text-gray-700">{c.createdAt ? c.createdAt.slice(0, 10) : '—'}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-700">{c.userId || '—'}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-700">{c.id}</td>
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

