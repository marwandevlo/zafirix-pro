'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, RefreshCw } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { NOTIFICATION_CATEGORY_LABELS } from '@/app/lib/atlas-notifications-engine';
import type { NotificationCategory } from '@/app/types/atlas-enterprise-modules';

type NotificationRow = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  status: string;
  createdAt: string;
};

type Props = {
  compact?: boolean;
  onUnreadChange?: (count: number) => void;
};

export function NotificationCenterWidget({ compact = false, onUnreadChange }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

  const load = useCallback(async (companyId?: string | null) => {
    setLoading(true);
    try {
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}&limit=30` : '?limit=30';
      const res = await fetch(`/api/notifications${qs}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { notifications?: NotificationRow[]; unreadCount?: number };
      setNotifications(data.notifications ?? []);
      onUnreadChange?.(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      await load(cid);
    })();
    const off = onCompanySwitched((cid) => { void load(cid); });
    return off;
  }, [load]);

  const runDispatchers = async () => {
    const cid = await getActiveCompanyDbRowId();
    if (!cid) return;
    setDispatching(true);
    await fetch('/api/notifications', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dispatch_all', companyId: cid }),
    });
    await load(cid);
    setDispatching(false);
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${compact ? '' : 'h-full'}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bell size={14} className="text-[#1B2A4A] shrink-0" />
          <h2 className="font-semibold text-gray-700 text-sm truncate">Centre de notifications</h2>
        </div>
        <button
          type="button"
          disabled={dispatching}
          onClick={() => void runDispatchers()}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={12} className={dispatching ? 'animate-spin' : ''} />
          Scanner
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-gray-400"><Loader2 size={18} className="animate-spin" /></div>
      ) : notifications.length === 0 ? (
        <p className="px-4 py-8 text-sm text-gray-400 text-center">Aucune notification — lancez un scan automatique</p>
      ) : (
        <ul className={`divide-y divide-gray-50 ${compact ? 'max-h-64 overflow-y-auto' : 'max-h-96 overflow-y-auto'}`}>
          {notifications.map((n) => (
            <li key={n.id} className="px-4 py-3 hover:bg-gray-50">
              <div className="flex items-start gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                  {NOTIFICATION_CATEGORY_LABELS[n.category] ?? n.category}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
