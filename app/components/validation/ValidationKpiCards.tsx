'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import { FileCheck, Clock, XCircle, RefreshCw, CheckCircle2, TrendingUp } from 'lucide-react';
import { MadAmount } from '@/app/components/ui/MadAmount';
import type { AtlasUiLocale } from '@/app/lib/atlas-format';

type KpiData = {
  kpis: {
    pending_draft: number;
    reviewed: number;
    validated_today: number;
    rejected: number;
    corrections_propagated: number;
  };
  amounts: {
    draft_total: number;
    reviewed_total: number;
    validated_total: number;
    rejected_total: number;
  };
};

type CardProps = {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: ReactNode;
  color: string;
  loading?: boolean;
};

function KpiCard({ icon, label, value, sub, color, loading }: CardProps) {
  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border ${color}`}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
        {loading ? (
          <div className="h-7 w-16 bg-gray-200 rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

type ValidationKpiCardsProps = {
  className?: string;
  locale?: AtlasUiLocale;
};

export const ValidationKpiCards = memo(function ValidationKpiCards({ className = '', locale = 'fr' }: ValidationKpiCardsProps) {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/validation/kpis', { credentials: 'include' })
      .then(r => r.json())
      .then((d: KpiData & { ok?: boolean }) => { if (d.ok !== false) setData(d); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const kpis = data?.kpis;
  const amounts = data?.amounts;

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 ${className}`}>
      <KpiCard
        icon={<Clock size={20} className="text-amber-600" />}
        label="En attente (brouillons)"
        value={kpis?.pending_draft ?? 0}
        sub={amounts ? <MadAmount value={amounts.draft_total} locale={locale} /> : undefined}
        color="bg-amber-50 border-amber-100"
        loading={loading}
      />
      <KpiCard
        icon={<RefreshCw size={20} className="text-purple-600" />}
        label="En révision"
        value={kpis?.reviewed ?? 0}
        sub={amounts ? <MadAmount value={amounts.reviewed_total} locale={locale} /> : undefined}
        color="bg-purple-50 border-purple-100"
        loading={loading}
      />
      <KpiCard
        icon={<CheckCircle2 size={20} className="text-green-600" />}
        label="Validés aujourd'hui"
        value={kpis?.validated_today ?? 0}
        sub={amounts ? <MadAmount value={amounts.validated_total} locale={locale} /> : undefined}
        color="bg-green-50 border-green-100"
        loading={loading}
      />
      <KpiCard
        icon={<XCircle size={20} className="text-red-600" />}
        label="Rejetés"
        value={kpis?.rejected ?? 0}
        sub={amounts ? <MadAmount value={amounts.rejected_total} locale={locale} /> : undefined}
        color="bg-red-50 border-red-100"
        loading={loading}
      />
      <KpiCard
        icon={<TrendingUp size={20} className="text-cyan-600" />}
        label="Corrections propagées"
        value={kpis?.corrections_propagated ?? 0}
        color="bg-cyan-50 border-cyan-100"
        loading={loading}
      />
      <KpiCard
        icon={<FileCheck size={20} className="text-blue-600" />}
        label="Total en attente"
        value={(kpis?.pending_draft ?? 0) + (kpis?.reviewed ?? 0)}
        sub="brouillons + révisions"
        color="bg-blue-50 border-blue-100"
        loading={loading}
      />
    </div>
  );
});
