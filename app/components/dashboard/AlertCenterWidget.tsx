'use client';

/**
 * AlertCenterWidget
 *
 * Unified alert feed widget for the dashboard.
 * Aggregates: rejected records, expiring/expired contracts, stuck OCR.
 * Color-coded by severity: red > orange > yellow.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, AlertTriangle, Bell, ChevronRight, Loader2, X } from 'lucide-react';

type AlertSeverity = 'red' | 'orange' | 'yellow';

type Alert = {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  href?: string;
  entity_id?: string;
  entity_type?: string;
  created_at: string;
};

type AlertCounts = { red: number; orange: number; yellow: number; total: number };

const SEVERITY_CONFIG: Record<AlertSeverity, { icon: React.ElementType; bg: string; border: string; text: string; badge: string }> = {
  red:    { icon: AlertCircle,   bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-500' },
  orange: { icon: AlertTriangle, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-500' },
  yellow: { icon: Bell,          bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-500' },
};

export function AlertCenterWidget() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/alerts', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { ok: boolean; alerts: Alert[]; counts: AlertCounts };
        if (!cancelled) {
          setAlerts(data.alerts ?? []);
          setCounts(data.counts);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = alerts.filter(a => !dismissed.has(a.id));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-amber-600" />
          <h2 className="font-semibold text-gray-700 text-sm">Centre d'alertes</h2>
          {counts && counts.total > 0 && (
            <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
              {counts.total - dismissed.size}
            </span>
          )}
        </div>
        {counts && (
          <div className="flex items-center gap-2">
            {counts.red > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                {counts.red}
              </span>
            )}
            {counts.orange > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-orange-700">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                {counts.orange}
              </span>
            )}
            {counts.yellow > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-yellow-700">
                <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                {counts.yellow}
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-2">
            <Bell size={14} className="text-green-500" />
          </div>
          <p className="text-xs text-gray-500 font-medium">Aucune alerte active</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Tous les contrats et enregistrements sont en ordre.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {visible.slice(0, 10).map(alert => {
            const cfg = SEVERITY_CONFIG[alert.severity];
            const Icon = cfg.icon;
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-3 px-4 py-3 ${cfg.bg} group`}
              >
                <Icon size={14} className={`${cfg.text} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.text}`}>{alert.category}</span>
                  </div>
                  <p className="text-xs font-medium text-gray-800 truncate">{alert.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{alert.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {alert.href && (
                    <button
                      type="button"
                      onClick={() => router.push(alert.href!)}
                      className={`p-1 rounded hover:bg-white/60 ${cfg.text} opacity-60 hover:opacity-100`}
                    >
                      <ChevronRight size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissed(s => new Set([...s, alert.id]))}
                    className="p-1 rounded hover:bg-white/60 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
