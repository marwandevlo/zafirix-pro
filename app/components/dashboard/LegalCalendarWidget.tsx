'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { categoryLabelFr } from '@/app/lib/atlas-fiscal-calendar';
import { fetchDashboardDeadlinesShared } from '@/app/lib/dashboard-deadlines-client';
import type { FiscalDeadline, FiscalDeadlineSeverity } from '@/app/types/atlas-fiscal-calendar';

type Props = { lang?: 'fr' | 'ar' };

const SEVERITY_DOT: Record<FiscalDeadlineSeverity, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  green: 'bg-green-500',
};

export function LegalCalendarWidget({ lang = 'fr' }: Props) {
  const router = useRouter();
  const t = (fr: string, ar: string) => (lang === 'fr' ? fr : ar);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [deadlines, setDeadlines] = useState<FiscalDeadline[]>([]);
  const [contracts, setContracts] = useState<Array<{ id: string; title: string; expiry_date: string | null; status: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const cid = await getActiveCompanyDbRowId();
        const [deadData, contractRes] = await Promise.all([
          fetchDashboardDeadlinesShared(cid),
          fetch('/api/legal/contracts?status=expiring', { credentials: 'include' }),
        ]);
        if (!cancelled && deadData) {
          setDeadlines((deadData.deadlines as FiscalDeadline[] | undefined) ?? []);
        }
        if (!cancelled && contractRes.ok) {
          const c = await contractRes.json() as { contracts?: typeof contracts };
          setContracts(c.contracts ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const off = onCompanySwitched(() => { void load(); });
    return () => { cancelled = true; off(); };
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-MA', { month: 'long', year: 'numeric' });

  const eventsByDay = useMemo(() => {
    const map = new Map<number, Array<{ label: string; severity: FiscalDeadlineSeverity | 'contract'; href?: string }>>();
    for (const d of deadlines) {
      const dt = new Date(d.dueDate);
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        const day = dt.getDate();
        const list = map.get(day) ?? [];
        list.push({ label: d.labelFr, severity: d.severity, href: d.href });
        map.set(day, list);
      }
    }
    for (const c of contracts) {
      if (!c.expiry_date) continue;
      const dt = new Date(c.expiry_date);
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        const day = dt.getDate();
        const list = map.get(day) ?? [];
        list.push({ label: c.title, severity: 'contract' });
        map.set(day, list);
      }
    }
    return map;
  }, [deadlines, contracts, year, month]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < (firstDow === 0 ? 6 : firstDow - 1); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    setViewDate(new Date(year, month + delta, 1));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[#1B2A4A]" />
          <h2 className="font-semibold text-gray-700 text-sm">{t('Calendrier fiscal & juridique', 'التقويم الضريبي والقانوني')}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shiftMonth(-1)} className="p-1 rounded hover:bg-gray-100"><ChevronLeft size={14} /></button>
          <span className="text-xs font-medium text-gray-600 capitalize min-w-[7rem] text-center">{monthLabel}</span>
          <button type="button" onClick={() => shiftMonth(1)} className="p-1 rounded hover:bg-gray-100"><ChevronRight size={14} /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
            {(lang === 'fr' ? ['L', 'M', 'M', 'J', 'V', 'S', 'D'] : ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح']).map((d, i) => (
              <div key={i} className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
            {cells.map((day, i) => {
              const events = day ? eventsByDay.get(day) ?? [] : [];
              const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
              return (
                <div
                  key={i}
                  className={`bg-white min-h-[3.25rem] p-1 text-xs ${day ? '' : 'bg-gray-50/50'} ${isToday ? 'ring-1 ring-inset ring-blue-300' : ''}`}
                >
                  {day && <span className={`font-medium ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>{day}</span>}
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {events.slice(0, 3).map((ev, j) => (
                      <span
                        key={j}
                        title={ev.label}
                        className={`w-1.5 h-1.5 rounded-full ${ev.severity === 'contract' ? 'bg-indigo-500' : (SEVERITY_DOT[ev.severity] ?? SEVERITY_DOT.green)}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 space-y-1.5 max-h-36 overflow-y-auto">
            {deadlines.slice(0, 4).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => router.push(d.href)}
                className="w-full text-left flex items-center gap-2 text-xs hover:bg-gray-50 rounded px-1 py-0.5"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[d.severity] ?? SEVERITY_DOT.green}`} />
                <span className="truncate flex-1">{d.labelFr}</span>
                <span className="text-gray-400 shrink-0">{categoryLabelFr(d.category)} · {d.dueDate}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
