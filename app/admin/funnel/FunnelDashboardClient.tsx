'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { readLocalFunnelEvents } from '@/app/lib/atlas-funnel-local-buffer';
import type { FunnelStatsResponse } from '@/app/api/admin/funnel-stats/route';

function aggregateLocal(windowDays: number): FunnelStatsResponse {
  const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const rows = readLocalFunnelEvents().filter((r) => new Date(r.created_at).getTime() >= since);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.event_name] = (counts[r.event_name] ?? 0) + 1;
  }
  const landingViews = counts.view_landing ?? 0;
  const signups = counts.signup_completed ?? 0;
  const onboardingStarted = counts.onboarding_started ?? 0;
  const onboardingCompleted = counts.onboarding_completed ?? 0;
  const pricingViews = counts.view_pricing ?? 0;
  const upgradeClicks = counts.upgrade_clicked ?? 0;
  const trialBannerClicks = counts.trial_banner_clicked ?? 0;
  const landingToSignupRate = landingViews > 0 ? signups / landingViews : null;
  return {
    windowDays,
    counts,
    signups,
    onboardingStarted,
    onboardingCompleted,
    landingViews,
    pricingViews,
    upgradeClicks,
    trialBannerClicks,
    landingToSignupRate,
    signupToOnboardingRate: signups > 0 ? onboardingCompleted / signups : null,
    conversionRateEstimate: landingToSignupRate,
    referralClicksDb: 0,
    referralLinkedSignupsDb: 0,
    referralActivatedDb: 0,
    referralRewardsGrantedDb: 0,
  };
}

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)} %`;
}

export default function FunnelDashboardClient() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<FunnelStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isAtlasSupabaseDataEnabled()) {
        setStats(aggregateLocal(days));
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      if (!token) {
        setError('Session requise.');
        return;
      }
      const res = await fetch(`/api/admin/funnel-stats?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as FunnelStatsResponse & { error?: string; message?: string };
      if (!res.ok) {
        setError(typeof json?.message === 'string' ? json.message : json?.error ?? 'Erreur');
        return;
      }
      setStats(json as FunnelStatsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!stats) return [];
    const keys = Object.keys(stats.counts).sort((a, b) => (stats.counts[b] ?? 0) - (stats.counts[a] ?? 0));
    return keys.map((k) => ({ name: k, count: stats.counts[k] ?? 0 }));
  }, [stats]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Activity size={16} /> Événements · {isAtlasSupabaseDataEnabled() ? 'Supabase (table events)' : 'localStorage (dev)'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            + onboarding_started, trial_banner_clicked · colonnes path, metadata, created_at
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-500">
            Fenêtre (jours){' '}
            <select
              value={days}
              onChange={(e) => setDays(Number.parseInt(e.target.value, 10) || 30)}
              className="ml-1 border border-gray-200 rounded-lg px-2 py-1 text-sm"
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
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{error}</div> : null}

      {stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs text-gray-500">Inscriptions (signup_completed)</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-2">{stats.signups}</p>
              <p className="text-[11px] text-gray-400 mt-2">Sur {stats.windowDays} jours</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs text-gray-500">Vues landing</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-2">{stats.landingViews}</p>
              <p className="text-[11px] text-gray-400 mt-2">Taux vers inscription</p>
              <p className="text-sm font-bold text-indigo-700 mt-1">{pct(stats.landingToSignupRate)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs text-gray-500">Onboarding terminé</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-2">{stats.onboardingCompleted}</p>
              <p className="text-[11px] text-gray-400 mt-2">Taux signup → onboarding</p>
              <p className="text-sm font-bold text-emerald-700 mt-1">{pct(stats.signupToOnboardingRate)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs text-gray-500">Clics upgrade (upgrade_clicked)</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-2">{stats.upgradeClicks}</p>
              <p className="text-[11px] text-gray-400 mt-2">Vues pricing : {stats.pricingViews}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Comptage par événement</p>
            </div>
            <div className="atlas-table-scroll">
              <table className="min-w-[400px] w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Événement</th>
                    <th className="px-5 py-2 font-semibold">Nombre</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-5 py-8 text-center text-gray-400">
                        Aucun événement dans cette fenêtre.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.name} className="border-t border-gray-100">
                        <td className="px-5 py-2 font-mono text-xs text-gray-800">{r.name}</td>
                        <td className="px-5 py-2 font-semibold text-gray-900">{r.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
