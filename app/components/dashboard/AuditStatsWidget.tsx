'use client';

/**
 * AuditStatsWidget
 *
 * Dashboard section showing audit activity for the last 30 days.
 * Displays action type breakdown + a simple daily activity sparkline.
 */

import { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';

type AuditStats = {
  total: number;
  by_action: Record<string, number>;
  daily: { date: string; count: number }[];
};

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  created:    { label: 'Créés',                 color: 'text-blue-700',   bg: 'bg-blue-100' },
  corrected:  { label: 'Corrigés',              color: 'text-amber-700',  bg: 'bg-amber-100' },
  reviewed:   { label: 'Révisés',               color: 'text-purple-700', bg: 'bg-purple-100' },
  validated:  { label: 'Validés',               color: 'text-green-700',  bg: 'bg-green-100' },
  rejected:   { label: 'Rejetés',               color: 'text-red-700',    bg: 'bg-red-100' },
  propagated: { label: 'Corrections propagées', color: 'text-cyan-700',   bg: 'bg-cyan-100' },
  routed:     { label: 'Routés',                color: 'text-indigo-700', bg: 'bg-indigo-100' },
  archived:   { label: 'Archivés',              color: 'text-gray-600',   bg: 'bg-gray-100' },
};

export function AuditStatsWidget() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/audit/stats', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { ok: boolean } & AuditStats;
        if (!cancelled) setStats(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const maxDaily = Math.max(1, ...(stats?.daily.map(d => d.count) ?? [1]));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-rose-600" />
          <h2 className="font-semibold text-gray-700 text-sm">Activité d'audit — 30 jours</h2>
        </div>
        {stats && (
          <span className="text-xs text-gray-400 font-medium">{stats.total} événement{stats.total > 1 ? 's' : ''}</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : !stats || stats.total === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          Aucune activité enregistrée sur les 30 derniers jours.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Action breakdown pills */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_action)
              .sort(([, a], [, b]) => b - a)
              .map(([action, count]) => {
                const cfg = ACTION_CONFIG[action] ?? { label: action, color: 'text-gray-700', bg: 'bg-gray-100' };
                return (
                  <div key={action} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${cfg.bg}`}>
                    <span className={`text-xs font-bold ${cfg.color}`}>{count}</span>
                    <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                  </div>
                );
              })}
          </div>

          {/* Mini sparkline */}
          <div>
            <p className="text-[10px] text-gray-400 mb-1.5">Activité quotidienne</p>
            <div className="flex items-end gap-0.5 h-12">
              {stats.daily.map(d => {
                const height = Math.max(2, Math.round((d.count / maxDaily) * 44));
                const isToday = d.date === new Date().toISOString().split('T')[0];
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count}`}
                    style={{ height: `${height}px` }}
                    className={`flex-1 rounded-sm min-w-[2px] transition-all ${
                      isToday ? 'bg-rose-500' : d.count > 0 ? 'bg-rose-200' : 'bg-gray-100'
                    }`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-gray-300 mt-1">
              <span>J-30</span>
              <span>Aujourd'hui</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
