'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { AdminAlert, AdminEmptyState, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';

type PaymentRequestRow = {
  id: string;
  userId: string;
  userEmail?: string | null;
  planId: string;
  amountMad: number;
  currency: string;
  billingPeriod: string;
  paymentMethod: string;
  manualProvider?: string | null;
  status: string;
  createdAt: string;
};

const FILTERS = ['all', 'pending', 'paid', 'rejected'] as const;
type Filter = (typeof FILTERS)[number];

function statusBadge(status: string): { label: string; cls: string } {
  if (status === 'pending') return { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  if (status === 'paid') return { label: 'Paid', cls: 'bg-blue-50 text-blue-800 border-blue-200' };
  if (status === 'rejected') return { label: 'Rejected', cls: 'bg-red-50 text-red-800 border-red-200' };
  return { label: status, cls: 'bg-gray-50 text-gray-700 border-gray-200' };
}

export default function PaymentsAdminClient() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<PaymentRequestRow[]>([]);
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
            setWarning('Local mode: payment requests list is not available.');
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        if (!token) return;

        const url = filter === 'all' ? '/api/admin/payment-requests' : `/api/admin/payment-requests?status=${encodeURIComponent(filter)}`;
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
          const paymentRequests =
            typeof json === 'object' && json && 'paymentRequests' in json && Array.isArray((json as { paymentRequests?: unknown }).paymentRequests)
              ? ((json as { paymentRequests: unknown[] }).paymentRequests as PaymentRequestRow[])
              : [];
          setRows(paymentRequests);
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
  }, [filter]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === 'pending').length;
    const paid = rows.filter((r) => r.status === 'paid').length;
    const rejected = rows.filter((r) => r.status === 'rejected').length;
    return { pending, paid, rejected, total: rows.length };
  }, [rows]);

  return (
    <AdminShell title="Admin · Payments">
      <div className="space-y-4">
        {loading ? <AdminAlert variant="info">Chargement…</AdminAlert> : null}
        {error ? <AdminAlert variant="error">Unable to load payment requests. {error}</AdminAlert> : null}
        {warning ? <AdminAlert variant="warning">{warning}</AdminAlert> : null}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Payment requests · طلبات الدفع</p>
            <p className="text-xs text-gray-500 mt-0.5">Filter by status and review recent requests.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filter === f ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? `All (${stats.total})` : f === 'pending' ? `Pending (${stats.pending})` : f === 'paid' ? `Paid (${stats.paid})` : `Rejected (${stats.rejected})`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-6">
            <AdminTableSkeleton cols={7} rows={7} />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-8">
            <AdminEmptyState
              title="No payment requests"
              description={filter === 'all' ? 'No requests found yet.' : `No requests with status “${filter}”.`}
            />
          </div>
        ) : (
          <div className="atlas-table-scroll">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="text-left">
                  <th className="px-6 py-4 font-semibold">Reference</th>
                  <th className="px-6 py-4 font-semibold">Plan</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                  <th className="px-6 py-4 font-semibold">Method</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Created</th>
                  <th className="px-6 py-4 font-semibold">User</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badge = statusBadge(r.status);
                  const method = r.paymentMethod === 'manual' ? `manual · ${r.manualProvider ?? '—'}` : r.paymentMethod;
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-xs text-gray-700">{r.id}</td>
                      <td className="px-6 py-4 text-gray-700">{r.planId}</td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">
                        {Math.round(r.amountMad).toLocaleString()} {r.currency}
                      </td>
                      <td className="px-6 py-4 text-gray-700">{method}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{r.createdAt ? r.createdAt.slice(0, 10) : '—'}</td>
                      <td className="px-6 py-4 text-gray-700">
                        <div className="font-medium text-sm">{r.userEmail || '—'}</div>
                        <div className="font-mono text-[11px] text-gray-400 mt-0.5">{r.userId}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

