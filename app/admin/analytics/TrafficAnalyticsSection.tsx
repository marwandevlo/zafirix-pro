'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, ArrowUpRight, Eye, Globe2, MousePointerClick, RefreshCw } from 'lucide-react';
import type { TrafficStatsResponse } from '@/app/api/admin/traffic-stats/route';
import { trafficSourceKind } from '@/app/lib/atlas-traffic-source';

const KIND_LABEL: Record<string, string> = {
  affiliate: 'Affiliate',
  search: 'Search',
  social: 'Social',
  direct: 'Direct',
  internal: 'Interne',
  referral: 'Referral',
};

function kindBadgeClass(kind: string): string {
  if (kind === 'affiliate') return 'bg-[#06b6d4]/20 text-[#67e8f9]';
  if (kind === 'search') return 'bg-emerald-500/15 text-emerald-300';
  if (kind === 'social') return 'bg-violet-500/15 text-violet-300';
  if (kind === 'direct') return 'bg-white/10 text-white/70';
  return 'bg-white/10 text-white/80';
}

export function TrafficAnalyticsSection({ days }: { days: number }) {
  const [data, setData] = useState<TrafficStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/traffic-stats?days=${days}`, { credentials: 'include', cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as TrafficStatsResponse & { error?: string; warning?: string };
      if (!res.ok || json.error) {
        setError(json.error === 'not_enabled' ? 'Supabase requis pour le trafic.' : 'Impossible de charger le trafic.');
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError('Impossible de charger le trafic.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTrend = useMemo(() => Math.max(1, ...(data?.trend ?? []).map((t) => t.views)), [data?.trend]);
  const maxSource = useMemo(() => Math.max(1, ...(data?.sources ?? []).map((s) => s.views)), [data?.sources]);

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0F1F3D] p-5 sm:p-6 shadow-xl shadow-[#0F1F3D]/30">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#06b6d4]">Traffic intelligence</p>
          <h2 className="mt-1 text-xl font-extrabold text-white">Analytics &amp; trafic</h2>
          <p className="mt-1 text-xs text-white/60">
            Vues anonymes · {days} derniers jours · table <span className="font-mono text-white/80">analytics_events</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-[#06b6d4]/30 bg-[#06b6d4]/10 px-3 py-2 text-sm font-semibold text-[#67e8f9] hover:bg-[#06b6d4]/20 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          icon={<Eye size={16} />}
          label="Page views"
          value={data?.pageViews ?? (loading ? '—' : 0)}
          hint="Toutes les pages trackées"
        />
        <MetricCard
          icon={<Globe2 size={16} />}
          label="Visiteurs"
          value={data?.uniqueVisitors ?? (loading ? '—' : 0)}
          hint="Visiteurs uniques (visitor_id)"
        />
        <MetricCard
          icon={<MousePointerClick size={16} />}
          label="Bounce"
          value={data ? `${data.bounceRate}%` : loading ? '—' : '0%'}
          hint="Visiteurs à une seule page"
        />
        <MetricCard
          icon={<ArrowUpRight size={16} />}
          label="Conversion"
          value={data ? `${data.conversionRate}%` : loading ? '—' : '0%'}
          hint={`${data?.conversions ?? 0} inscriptions`}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <Activity size={16} className="text-[#06b6d4]" /> Tendance des pages vues
        </p>
        <div className="mt-4 h-28 flex items-end gap-1">
          {(data?.trend ?? []).map((g) => {
            const h = Math.round((g.views / maxTrend) * 100);
            return (
              <div key={g.day} className="flex-1 min-w-[2px]">
                <div
                  title={`${g.day}: ${g.views}`}
                  className="w-full rounded-t bg-linear-to-t from-[#0e7490] to-[#06b6d4]"
                  style={{ height: `${Math.max(4, h)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassTable
          title="Sources de trafic"
          subtitle="Referrers, search, social et codes affiliate"
          headers={['Source', 'Type', 'Vues']}
          loading={loading && !data}
          empty="Aucune source pour cette période."
          rows={(data?.sources ?? []).map((s) => {
            const kind = s.kind || trafficSourceKind(s.referrer);
            return [
              <span key={`${s.referrer}-n`} className="font-semibold text-white">
                {s.referrer}
              </span>,
              <span key={`${s.referrer}-k`} className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${kindBadgeClass(kind)}`}>
                {KIND_LABEL[kind] ?? kind}
              </span>,
              <span key={`${s.referrer}-v`} className="tabular-nums text-[#67e8f9]">
                {s.views}
                <span className="ml-2 inline-block h-1.5 w-16 align-middle rounded-full bg-white/10 overflow-hidden">
                  <span className="block h-full bg-[#06b6d4]" style={{ width: `${Math.round((s.views / maxSource) * 100)}%` }} />
                </span>
              </span>,
            ];
          })}
        />
        <GlassTable
          title="Pages les plus visitées"
          subtitle="Landing, blog, pricing, app"
          headers={['Page', 'Vues']}
          loading={loading && !data}
          empty="Aucune page vue pour cette période."
          rows={(data?.pages ?? []).map((p) => [
            <span key={p.path} className="font-mono text-[13px] text-white/90">
              {p.path}
            </span>,
            <span key={`${p.path}-v`} className="tabular-nums font-semibold text-[#67e8f9]">
              {p.views}
            </span>,
          ])}
        />
      </div>
    </section>
  );
}

function MetricCard(props: { icon: ReactNode; label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55 flex items-center gap-2">
        <span className="text-[#06b6d4]">{props.icon}</span>
        {props.label}
      </p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-white">{props.value}</p>
      <p className="mt-1 text-[11px] text-white/45">{props.hint}</p>
    </div>
  );
}

function GlassTable(props: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: ReactNode[][];
  loading: boolean;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md min-w-0 w-full max-w-full overflow-x-visible">
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-sm font-semibold text-white">{props.title}</p>
        <p className="text-[11px] text-white/50">{props.subtitle}</p>
      </div>
      <div className="atlas-table-scroll">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-white/40">
              {props.headers.map((h) => (
                <th key={h} className="px-4 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.loading ? (
              <tr>
                <td colSpan={props.headers.length} className="px-4 py-6 text-white/50">
                  Chargement…
                </td>
              </tr>
            ) : props.rows.length === 0 ? (
              <tr>
                <td colSpan={props.headers.length} className="px-4 py-6 text-white/50">
                  {props.empty}
                </td>
              </tr>
            ) : (
              props.rows.map((cells, i) => (
                <tr key={i} className="border-t border-white/5">
                  {cells.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 align-middle">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
