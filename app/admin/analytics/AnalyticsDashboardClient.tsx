'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Ban, BarChart3, DollarSign, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { TrafficAnalyticsSection } from '@/app/admin/analytics/TrafficAnalyticsSection';

type Metrics = {
  users: {
    total: number;
    active: number;
    suspended: number;
    banned: number;
  };
  subscriptions: {
    total: number;
    active: number;
    byPlan: { free: number; pro: number; vip: number; enterprise: number; other: number };
  };
  revenue: {
    estMonthlyUsd: number;
    activePro: number;
    activeVip: number;
  };
  growth: Array<{ day: string; count: number }>;
  planDist: { free: number; pro: number; vip: number; enterprise: number; other: number };
};

type ProfileCreatedAtRow = { created_at: string | null };
type ActiveSubscriptionRow = { id: string; status: string | null; plan_slug: string | null; plan: string | null };

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function AnalyticsDashboardClient() {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isAtlasSupabaseDataEnabled()) {
        setError('Supabase requis pour ces métriques (profiles/subscriptions).');
        return;
      }

      const [uTotal, uActive, uSusp, uBanned] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'banned'),
      ]);
      if (uTotal.error || uActive.error || uSusp.error || uBanned.error) throw new Error('db_error_users');

      const [sTotal, sActive] = await Promise.all([
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);
      if (sTotal.error || sActive.error) throw new Error('db_error_subs');

      const [pFree, pPro, pVip, pEnt] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'free'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'vip'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'enterprise'),
      ]);
      if (pFree.error || pPro.error || pVip.error || pEnt.error) throw new Error('db_error_plans');

      const since = new Date();
      since.setDate(since.getDate() - clamp(days, 1, 365));
      const growthRes = await supabase
        .from('profiles')
        .select('created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(5000);
      if (growthRes.error) throw new Error('db_error_growth');

      const buckets = new Map<string, number>();
      const start = new Date(since);
      start.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        buckets.set(ymd(d), 0);
      }
      for (const r of (growthRes.data ?? []) as ProfileCreatedAtRow[]) {
        const raw = String(r.created_at ?? '');
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) continue;
        const key = ymd(dt);
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      const growth = Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));

      const activeSubsRes = await supabase
        .from('subscriptions')
        .select('id, status, plan_slug, plan')
        .eq('status', 'active')
        .limit(5000);
      if (activeSubsRes.error) throw new Error('db_error_active_subs');

      let activePro = 0;
      let activeVip = 0;
      const subByPlan = { free: 0, pro: 0, vip: 0, enterprise: 0, other: 0 };
      for (const s of (activeSubsRes.data ?? []) as ActiveSubscriptionRow[]) {
        const plan = String(s.plan_slug ?? s.plan ?? '').toLowerCase();
        if (plan === 'pro') activePro += 1;
        else if (plan === 'vip') activeVip += 1;

        if (plan === 'free') subByPlan.free += 1;
        else if (plan === 'pro') subByPlan.pro += 1;
        else if (plan === 'vip') subByPlan.vip += 1;
        else if (plan === 'enterprise') subByPlan.enterprise += 1;
        else subByPlan.other += 1;
      }
      const estMonthlyUsd = activePro * 49 + activeVip * 199;

      const planDist = {
        free: pFree.count ?? 0,
        pro: pPro.count ?? 0,
        vip: pVip.count ?? 0,
        enterprise: pEnt.count ?? 0,
        other: Math.max(0, (uTotal.count ?? 0) - (pFree.count ?? 0) - (pPro.count ?? 0) - (pVip.count ?? 0) - (pEnt.count ?? 0)),
      };

      setMetrics({
        users: {
          total: uTotal.count ?? 0,
          active: uActive.count ?? 0,
          suspended: uSusp.count ?? 0,
          banned: uBanned.count ?? 0,
        },
        subscriptions: {
          total: sTotal.count ?? 0,
          active: sActive.count ?? 0,
          byPlan: subByPlan,
        },
        revenue: { estMonthlyUsd, activePro, activeVip },
        growth,
        planDist,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxGrowth = useMemo(() => {
    if (!metrics?.growth?.length) return 1;
    return Math.max(1, ...metrics.growth.map((g) => g.count));
  }, [metrics?.growth]);

  const planBars = useMemo(() => {
    const d = metrics?.planDist;
    if (!d) return [];
    const total = Math.max(1, d.free + d.pro + d.vip + d.enterprise + d.other);
    return [
      { key: 'free', label: 'Free', value: d.free, pct: d.free / total, cls: 'bg-slate-500' },
      { key: 'pro', label: 'Pro', value: d.pro, pct: d.pro / total, cls: 'bg-blue-500' },
      { key: 'vip', label: 'VIP', value: d.vip, pct: d.vip / total, cls: 'bg-violet-500' },
      { key: 'enterprise', label: 'Enterprise', value: d.enterprise, pct: d.enterprise / total, cls: 'bg-emerald-500' },
      { key: 'other', label: 'Other', value: d.other, pct: d.other / total, cls: 'bg-gray-400' },
    ];
  }, [metrics?.planDist]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 bg-[#0F1F3D] text-white">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 size={16} /> Admin Analytics (Supabase)
          </p>
          <p className="text-xs text-white/70 mt-1">
            Tables <span className="font-mono">profiles</span> &amp; <span className="font-mono">subscriptions</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-white/70">
            Jours{' '}
            <select
              value={days}
              onChange={(e) => setDays(Number.parseInt(e.target.value, 10) || 30)}
              className="ml-1 border border-white/15 bg-white/10 text-white rounded-lg px-2 py-1 text-sm"
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      <TrafficAnalyticsSection days={days} />

      {error ? <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{error}</div> : null}

      {metrics ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#060816] p-5 shadow-sm text-white">
              <p className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2">
                <Users size={14} /> Users
              </p>
              <p className="text-3xl font-extrabold mt-2 tabular-nums">{metrics.users.total}</p>
              <p className="text-xs text-white/60 mt-2">
                Active: {metrics.users.active} · Suspended: {metrics.users.suspended} · Banned: {metrics.users.banned}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#060816] p-5 shadow-sm text-white">
              <p className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2">
                <BadgeCheck size={14} /> Subscriptions
              </p>
              <p className="text-3xl font-extrabold mt-2 tabular-nums">{metrics.subscriptions.total}</p>
              <p className="text-xs text-white/60 mt-2">Active: {metrics.subscriptions.active}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#060816] p-5 shadow-sm text-white">
              <p className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2">
                <DollarSign size={14} /> Revenue (est.)
              </p>
              <p className="text-3xl font-extrabold mt-2 tabular-nums">${metrics.revenue.estMonthlyUsd}</p>
              <p className="text-xs text-white/60 mt-2">
                Pro: {metrics.revenue.activePro} × $49 · VIP: {metrics.revenue.activeVip} × $199
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#060816] p-5 shadow-sm text-white">
              <p className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 size={16} /> Users growth (last {days}d)
              </p>
              <p className="text-xs text-white/60 mt-1">Grouped by `profiles.created_at`.</p>
              <div className="mt-4 h-40 flex items-end gap-1">
                {metrics.growth.map((g) => {
                  const h = Math.round((g.count / maxGrowth) * 100);
                  return (
                    <div key={g.day} className="flex-1 min-w-[2px]">
                      <div
                        title={`${g.day}: ${g.count}`}
                        className="w-full rounded-t bg-linear-to-t from-[#0066FF] to-[#00F0FF]"
                        style={{ height: `${Math.max(2, h)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#060816] p-5 shadow-sm text-white">
              <p className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert size={16} /> Plans distribution (profiles.plan)
              </p>
              <p className="text-xs text-white/60 mt-1">Free / Pro / VIP / Enterprise.</p>
              <div className="mt-5 space-y-3">
                {planBars.map((b) => (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span className="font-semibold text-white">{b.label}</span>
                      <span className="tabular-nums">{b.value}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-2 ${b.cls}`} style={{ width: `${Math.round(b.pct * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#060816] p-5 shadow-sm text-white">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Ban size={16} /> Subscription plans (active only)
            </p>
            <p className="text-xs text-white/60 mt-1">Based on `subscriptions.plan_slug` or `subscriptions.plan`.</p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
              {Object.entries(metrics.subscriptions.byPlan).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-white/60 uppercase tracking-wide">{k}</p>
                  <p className="text-2xl font-extrabold mt-1 tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
