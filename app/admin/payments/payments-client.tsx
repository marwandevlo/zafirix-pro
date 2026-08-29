'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { AdminAlert } from '@/app/admin/_components/AdminUi';
import { AdminDataTable, AdminFilterChip, type AdminColumn } from '@/app/admin/_components/AdminDataTable';
import { AdminStatusBadge } from '@/app/admin/_components/AdminStatusBadge';
import { MadAmount } from '@/app/components/ui/MadAmount';

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

  const columns: AdminColumn<PaymentRequestRow>[] = [
    {
      key: 'id',
      header: 'Reference',
      sortValue: (r) => r.id,
      className: 'font-mono text-[11px] whitespace-nowrap',
      render: (r) => r.id,
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.planId,
      render: (r) => r.planId,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortValue: (r) => r.amountMad,
      className: 'text-right font-semibold',
      headerClassName: 'text-right',
      render: (r) => <MadAmount value={r.amountMad} />,
    },
    {
      key: 'method',
      header: 'Method',
      sortValue: (r) => r.paymentMethod,
      render: (r) => (r.paymentMethod === 'manual' ? `manual · ${r.manualProvider ?? '—'}` : r.paymentMethod),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      render: (r) => <AdminStatusBadge value={r.status} />,
    },
    {
      key: 'created',
      header: 'Created',
      sortValue: (r) => r.createdAt,
      className: 'whitespace-nowrap text-slate-500',
      render: (r) => (r.createdAt ? r.createdAt.slice(0, 10) : '—'),
    },
    {
      key: 'user',
      header: 'User',
      sortValue: (r) => r.userEmail || r.userId,
      render: (r) => (
        <div>
          <p className="font-medium">{r.userEmail || '—'}</p>
          <p className="font-mono text-[11px] text-slate-400">{r.userId}</p>
        </div>
      ),
    },
  ];

  return (
    <AdminShell title="Payments">
      {error ? <AdminAlert variant="error">Unable to load payment requests. {error}</AdminAlert> : null}
      {warning ? <AdminAlert variant="warning">{warning}</AdminAlert> : null}
      <p className="text-sm text-slate-500">Demandes de paiement manuelles et Paddle — filtrez par statut.</p>
      <AdminDataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        emptyTitle="No payment requests"
        emptyDescription={filter === 'all' ? 'No requests found yet.' : `No requests with status “${filter}”.`}
        minWidthClass="min-w-[1100px]"
        toolbar={
          <>
            {FILTERS.map((f) => (
              <AdminFilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === 'all'
                  ? `All (${stats.total})`
                  : f === 'pending'
                    ? `Pending (${stats.pending})`
                    : f === 'paid'
                      ? `Paid (${stats.paid})`
                      : `Rejected (${stats.rejected})`}
              </AdminFilterChip>
            ))}
          </>
        }
      />
    </AdminShell>
  );
}

