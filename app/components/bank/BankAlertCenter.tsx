'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Bell, Loader2 } from 'lucide-react';

type Alert = { id: string; severity: string; category: string; title: string; description: string };

export function BankAlertCenter({ compact = false }: { compact?: boolean }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/bank/alerts', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { alerts: Alert[] };
        if (!cancelled) setAlerts(data.alerts ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (compact && alerts.length === 0 && !loading) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Bell size={14} className="text-blue-600" />
        <h2 className="font-semibold text-gray-700 text-sm">Alertes bancaires</h2>
        {alerts.length > 0 && (
          <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">{alerts.length}</span>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : alerts.length === 0 ? (
        <p className="px-4 py-4 text-xs text-gray-400 text-center">Aucune alerte bancaire active.</p>
      ) : (
        <div className={`divide-y divide-gray-50 ${compact ? 'max-h-40 overflow-y-auto' : ''}`}>
          {alerts.slice(0, compact ? 5 : 15).map(a => (
            <div key={a.id} className={`px-4 py-2.5 flex gap-2 ${a.severity === 'red' ? 'bg-red-50/50' : a.severity === 'orange' ? 'bg-orange-50/50' : 'bg-yellow-50/50'}`}>
              {a.severity === 'red' ? <AlertCircle size={12} className="text-red-600 shrink-0 mt-0.5" /> : <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-gray-500 uppercase">{a.category}</p>
                <p className="text-xs font-medium text-gray-800 truncate">{a.title}</p>
                <p className="text-[10px] text-gray-500">{a.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
