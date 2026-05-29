import { useEffect, useMemo, useState } from 'react';
import { Building2, FileText, Users, Zap } from 'lucide-react';
import {
  getActivePlan,
  getEffectivePlanLimits,
  getUsage,
  refreshAtlasUsageState,
} from '@/app/lib/atlas-usage-limits';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { formatLimit } from '@/app/lib/atlas-pricing-plans';

type Row = {
  key: 'companies' | 'users' | 'operations' | 'invoices';
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: { bar: string; bg: string; text: string };
};

const rows: Row[] = [
  { key: 'companies', label: 'Sociétés', icon: Building2, color: { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' } },
  { key: 'users', label: 'Utilisateurs', icon: Users, color: { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' } },
  { key: 'invoices', label: 'Factures', icon: FileText, color: { bar: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-800' } },
  { key: 'operations', label: 'Opérations', icon: Zap, color: { bar: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-800' } },
];

function pct(used: number, limit: number | null): number | null {
  if (!limit || limit <= 0) return null;
  return Math.min(1, Math.max(0, used / limit));
}

export function UsageWidget() {
  const [tick, setTick] = useState(0);
  const supabaseMode = isAtlasSupabaseDataEnabled();

  useEffect(() => {
    const refresh = async () => {
      if (supabaseMode) await refreshAtlasUsageState();
      setTick((t) => t + 1);
    };
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [supabaseMode]);

  const plan = useMemo(() => {
    void tick;
    return getActivePlan();
  }, [tick]);
  const usage = useMemo(() => {
    void tick;
    return getUsage();
  }, [tick]);
  const limits = useMemo(() => {
    void tick;
    return getEffectivePlanLimits(plan);
  }, [plan, tick]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Usage</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Plan: <span className="font-semibold text-gray-600">{plan?.name ?? '—'}</span>
          </p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
          {supabaseMode ? 'Supabase' : 'LocalStorage'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {rows.map((r) => {
          if (r.key === 'invoices' && limits.invoices === null) return null;
          const used = usage[r.key] ?? 0;
          const limit = limits[r.key];
          const percentage = pct(used, limit);
          const Icon = r.icon;
          const limitLabel = limit === null ? formatLimit({ kind: 'unlimited' }) : String(limit);
          return (
            <div key={r.key} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg border ${r.color.bg} flex items-center justify-center`}>
                    <Icon size={16} className={r.color.text} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{r.label}</p>
                    <p className="text-xs text-gray-400">{used} / {limitLabel}</p>
                  </div>
                </div>
                {percentage !== null && (
                  <span className="text-xs font-semibold text-gray-500">{Math.round(percentage * 100)}%</span>
                )}
              </div>

              <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-2 ${r.color.bar}`}
                  style={{ width: percentage === null ? '30%' : `${Math.round(percentage * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
