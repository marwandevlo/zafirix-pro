'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, Clock, Globe, Loader2, Radar } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import type { FiscalDeadline, FiscalDeadlineSeverity } from '@/app/types/atlas-fiscal-calendar';

type Props = {
  lang?: 'fr' | 'ar';
  compact?: boolean;
  maxItems?: number;
};

const SEVERITY_STYLE: Record<FiscalDeadlineSeverity, { card: string; badge: string; icon: typeof AlertCircle }> = {
  red: { card: 'bg-red-50 border-red-200 text-red-800', badge: 'bg-red-500', icon: AlertCircle },
  orange: { card: 'bg-orange-50 border-orange-200 text-orange-800', badge: 'bg-orange-500', icon: Clock },
  green: { card: 'bg-green-50 border-green-200 text-green-800', badge: 'bg-green-500', icon: CheckCircle },
};

export function DeadlineRadarWidget({ lang = 'fr', compact = false, maxItems = 6 }: Props) {
  const router = useRouter();
  const t = (fr: string, ar: string) => (lang === 'fr' ? fr : ar);
  const [loading, setLoading] = useState(true);
  const [deadlines, setDeadlines] = useState<FiscalDeadline[]>([]);
  const [counts, setCounts] = useState({ red: 0, orange: 0, green: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async (companyId?: string | null) => {
      setLoading(true);
      try {
        const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
        const res = await fetch(`/api/dashboard/deadlines${qs}`, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          deadlines?: FiscalDeadline[];
          counts?: typeof counts;
        };
        if (!cancelled) {
          setDeadlines(data.deadlines ?? []);
          setCounts(data.counts ?? { red: 0, orange: 0, green: 0, total: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      await load(cid);
    })();
    const off = onCompanySwitched((cid) => { void load(cid); });
    return () => { cancelled = true; off(); };
  }, []);

  const visible = deadlines.slice(0, maxItems);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar size={14} className="text-[#1B2A4A]" />
          <h2 className="font-semibold text-gray-700 text-sm">
            {t('Radar échéances fiscales', 'رادار المواعيد الضريبية')}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {counts.red > 0 && (
            <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">{counts.red}</span>
          )}
          {counts.orange > 0 && (
            <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded-full">{counts.orange}</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <div className={`p-3 space-y-2 ${compact ? 'max-h-64 overflow-y-auto' : ''}`}>
          {visible.map((d) => {
            const style = SEVERITY_STYLE[d.severity];
            const Icon = style.icon;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => router.push(d.href)}
                className={`w-full flex items-start gap-2 p-2.5 rounded-lg border text-xs text-left transition-opacity hover:opacity-90 ${style.card}`}
              >
                <Icon size={14} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t(d.labelFr, d.labelAr)}</p>
                  <p className="opacity-70 mt-0.5">{d.dueDate}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${style.badge}`}>
                    {d.daysRemaining <= 0 ? t('Échu', 'منته') : `${d.daysRemaining}j`}
                  </span>
                  {d.externalUrl && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); window.open(d.externalUrl, '_blank'); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); window.open(d.externalUrl, '_blank'); } }}
                      className="opacity-60 hover:opacity-100"
                    >
                      <Globe size={10} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {!visible.length && (
            <p className="text-xs text-gray-400 text-center py-4">{t('Aucune échéance proche', 'لا مواعيد قريبة')}</p>
          )}
        </div>
      )}
    </div>
  );
}
