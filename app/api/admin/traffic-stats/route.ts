import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { trafficSourceKind } from '@/app/lib/atlas-traffic-source';

export const dynamic = 'force-dynamic';

export type TrafficSourceRow = { referrer: string; views: number; kind: string };
export type TrafficPageRow = { path: string; views: number };
export type TrafficTrendRow = { day: string; views: number };

export type TrafficStatsResponse = {
  ok: true;
  windowDays: number;
  pageViews: number;
  uniqueVisitors: number;
  bounceRate: number;
  conversionRate: number;
  conversions: number;
  sources: TrafficSourceRow[];
  pages: TrafficPageRow[];
  trend: TrafficTrendRow[];
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyTrend(days: number): TrafficTrendRow[] {
  const out: TrafficTrendRow[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ day: ymd(d), views: 0 });
  }
  return out;
}

function aggregateRows(
  rows: Array<{ path?: string | null; referrer?: string | null; visitor_id?: string | null; created_at?: string | null }>,
  days: number,
  conversions: number,
): Omit<TrafficStatsResponse, 'ok' | 'windowDays'> {
  const pageViews = rows.length;
  const byVisitor = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byPage = new Map<string, number>();
  const trendMap = new Map(emptyTrend(days).map((t) => [t.day, t.views]));

  for (const row of rows) {
    const path = String(row.path || '/');
    const referrer = String(row.referrer || 'direct');
    byPage.set(path, (byPage.get(path) ?? 0) + 1);
    bySource.set(referrer, (bySource.get(referrer) ?? 0) + 1);
    const vid = String(row.visitor_id || '').trim();
    if (vid) byVisitor.set(vid, (byVisitor.get(vid) ?? 0) + 1);
    const created = row.created_at ? new Date(row.created_at) : null;
    if (created && !Number.isNaN(created.getTime())) {
      const key = ymd(created);
      if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }
  }

  const uniqueVisitors = byVisitor.size;
  let single = 0;
  for (const n of byVisitor.values()) if (n === 1) single += 1;
  const bounceRate = uniqueVisitors > 0 ? Math.round((single / uniqueVisitors) * 1000) / 10 : 0;
  const conversionRate = uniqueVisitors > 0 ? Math.round((conversions / uniqueVisitors) * 1000) / 10 : 0;

  const sources = Array.from(bySource.entries())
    .map(([referrer, views]) => ({ referrer, views, kind: trafficSourceKind(referrer) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);
  const pages = Array.from(byPage.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);
  const trend = Array.from(trendMap.entries()).map(([day, views]) => ({ day, views }));

  return { pageViews, uniqueVisitors, bounceRate, conversionRate, conversions, sources, pages, trend };
}

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const days = Math.min(365, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10) || 30));
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const admin = getSupabaseServiceRoleClient();

    const rpc = await admin.rpc('atlas_admin_traffic_stats', { p_days: days });
    const { count: conversionCount } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'signup_completed')
      .gte('created_at', since.toISOString());
    const conversions = conversionCount ?? 0;

    if (!rpc.error && rpc.data && typeof rpc.data === 'object') {
      const data = rpc.data as {
        pageViews?: number;
        uniqueVisitors?: number;
        bounceRate?: number;
        sources?: Array<{ referrer?: string; views?: number }>;
        pages?: Array<{ path?: string; views?: number }>;
        trend?: Array<{ day?: string; views?: number }>;
      };
      const uniqueVisitors = Number(data.uniqueVisitors || 0);
      const sources = (data.sources ?? []).map((s) => ({
        referrer: String(s.referrer || 'direct'),
        views: Number(s.views || 0),
        kind: trafficSourceKind(String(s.referrer || 'direct')),
      }));
      const filledTrend = emptyTrend(days);
      const byDay = new Map((data.trend ?? []).map((t) => [String(t.day), Number(t.views || 0)]));
      for (const row of filledTrend) row.views = byDay.get(row.day) ?? 0;

      return NextResponse.json({
        ok: true,
        windowDays: days,
        pageViews: Number(data.pageViews || 0),
        uniqueVisitors,
        bounceRate: Number(data.bounceRate || 0),
        conversionRate: uniqueVisitors > 0 ? Math.round((conversions / uniqueVisitors) * 1000) / 10 : 0,
        conversions,
        sources,
        pages: (data.pages ?? []).map((p) => ({ path: String(p.path || '/'), views: Number(p.views || 0) })),
        trend: filledTrend,
      } satisfies TrafficStatsResponse);
    }

    const { data, error } = await admin
      .from('analytics_events')
      .select('path, referrer, visitor_id, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(20000);

    if (error) {
      console.warn('[admin/traffic-stats] query failed', error.message);
      return NextResponse.json(
        {
          ok: true,
          windowDays: days,
          pageViews: 0,
          uniqueVisitors: 0,
          bounceRate: 0,
          conversionRate: 0,
          conversions,
          sources: [],
          pages: [],
          trend: emptyTrend(days),
          warning: error.message,
        },
        { status: 200 },
      );
    }

    const agg = aggregateRows((data ?? []) as Array<{ path?: string; referrer?: string; visitor_id?: string; created_at?: string }>, days, conversions);
    return NextResponse.json({ ok: true, windowDays: days, ...agg } satisfies TrafficStatsResponse);
  } catch (error) {
    console.error('[admin/traffic-stats] unexpected', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
