'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/app/admin/_components/AdminShell';
import { AdminAlert } from '@/app/admin/_components/AdminUi';
import { AdminDataTable, type AdminColumn } from '@/app/admin/_components/AdminDataTable';
import { AdminStatusBadge } from '@/app/admin/_components/AdminStatusBadge';
import { MadAmount } from '@/app/components/ui/MadAmount';
import { adminAuthedFetch } from '@/app/lib/admin/admin-client-auth';

type Leader = { userId: string; lifetimeEarned: number; pendingEarnings: number; paidOut: number };
type Tx = {
  id: string;
  referrerUserId: string;
  commissionAmount: number;
  commissionPercent: number;
  status: string;
  source: string;
  createdAt: string;
};

type Payload = {
  ok?: boolean;
  error?: string;
  clicks?: number;
  signups?: number;
  activated?: number;
  lifetimeEarned?: number;
  pendingEarnings?: number;
  paidOut?: number;
  affiliates?: number;
  leaders?: Leader[];
  transactions?: Tx[];
};

export default function AdminAffiliateClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminAuthedFetch('/api/admin/affiliate-stats');
        const json = (await res.json().catch(() => ({}))) as Payload;
        if (!res.ok || !json.ok) throw new Error(json.error || 'load_failed');
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const leaderCols: AdminColumn<Leader>[] = [
    {
      key: 'userId',
      header: 'Affiliate user',
      sortValue: (r) => r.userId,
      className: 'font-mono text-[11px] whitespace-nowrap',
      render: (r) => r.userId,
    },
    {
      key: 'lifetime',
      header: 'Lifetime',
      sortValue: (r) => r.lifetimeEarned,
      render: (r) => <MadAmount value={r.lifetimeEarned} />,
    },
    {
      key: 'pending',
      header: 'Pending',
      sortValue: (r) => r.pendingEarnings,
      render: (r) => <MadAmount value={r.pendingEarnings} />,
    },
    {
      key: 'paid',
      header: 'Paid out',
      sortValue: (r) => r.paidOut,
      render: (r) => <MadAmount value={r.paidOut} />,
    },
  ];

  const txCols: AdminColumn<Tx>[] = [
    {
      key: 'created',
      header: 'Date',
      sortValue: (r) => r.createdAt,
      className: 'whitespace-nowrap text-slate-500',
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('fr-MA') : '—'),
    },
    {
      key: 'referrer',
      header: 'Referrer',
      sortValue: (r) => r.referrerUserId,
      className: 'font-mono text-[11px] whitespace-nowrap',
      render: (r) => r.referrerUserId,
    },
    {
      key: 'source',
      header: 'Source',
      sortValue: (r) => r.source,
      render: (r) => r.source,
    },
    {
      key: 'pct',
      header: 'Rate',
      sortValue: (r) => r.commissionPercent,
      render: (r) => `${r.commissionPercent}%`,
    },
    {
      key: 'amount',
      header: 'Commission',
      sortValue: (r) => r.commissionAmount,
      render: (r) => <MadAmount value={r.commissionAmount} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      render: (r) => <AdminStatusBadge value={r.status} />,
    },
  ];

  return (
    <AdminShell title="Affiliate">
      {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          Vue plateforme des clics, filleuls et commissions (Paddle / paiement manuel).
        </p>
        <Link
          href="/dashboard/affiliate"
          className="inline-flex h-9 items-center rounded-xl bg-[#06b6d4] px-3 text-xs font-bold text-[#0F1F3D]"
        >
          Ouvrir mon tableau affilié →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Clics', data?.clicks ?? 0],
          ['Filleuls actifs', data?.activated ?? 0],
          ['Affiliés', data?.affiliates ?? 0],
          ['Cumul commissions', null],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-[#0F1F3D] tabular-nums">
              {label === 'Cumul commissions' ? <MadAmount value={data?.lifetimeEarned ?? 0} /> : value}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        En attente <MadAmount value={data?.pendingEarnings ?? 0} /> · versé <MadAmount value={data?.paidOut ?? 0} />
      </p>

      <AdminDataTable
        rows={data?.leaders ?? []}
        columns={leaderCols}
        rowKey={(r) => r.userId}
        loading={loading}
        emptyTitle="Aucun affilié"
        emptyDescription="Les soldes apparaissent dès qu’un filleul paie."
        minWidthClass="min-w-[720px]"
      />

      <AdminDataTable
        rows={data?.transactions ?? []}
        columns={txCols}
        rowKey={(r) => r.id}
        loading={loading}
        emptyTitle="Aucune commission"
        searchPlaceholder="Filtrer…"
        minWidthClass="min-w-[960px]"
      />
    </AdminShell>
  );
}
