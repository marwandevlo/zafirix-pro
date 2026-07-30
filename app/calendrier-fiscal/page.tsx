'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Settings2,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { categoryLabelFr } from '@/app/lib/atlas-fiscal-calendar';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type { FiscalDeadlineCategory, FiscalDeadlineSeverity } from '@/app/types/atlas-fiscal-calendar';
import type {
  AtlasComplianceEvent,
  AtlasNotificationPreferences,
  AtlasTaxDeadline,
} from '@/app/types/atlas-tax-calendar';
import { DEFAULT_FISCAL_CATEGORIES } from '@/app/types/atlas-tax-calendar';

const SEVERITY_STYLE: Record<FiscalDeadlineSeverity, { dot: string; badge: string }> = {
  red: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' },
  orange: { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' },
  green: { dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'À venir',
  due_soon: 'Proche',
  overdue: 'En retard',
  filed: 'Déposé',
  waived: 'Dispensé',
};

const ALL_CATEGORIES: FiscalDeadlineCategory[] = ['tva', 'is', 'ir', 'cnss', 'acompte_is', 'depot_legal', 'patente'];

export default function CalendrierFiscalPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [deadlines, setDeadlines] = useState<AtlasTaxDeadline[]>([]);
  const [events, setEvents] = useState<AtlasComplianceEvent[]>([]);
  const [preferences, setPreferences] = useState<AtlasNotificationPreferences | null>(null);
  const [counts, setCounts] = useState({ red: 0, orange: 0, green: 0, total: 0, filed: 0 });
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefsForm, setPrefsForm] = useState<Partial<AtlasNotificationPreferences>>({});

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{
      deadlines?: AtlasTaxDeadline[];
      events?: AtlasComplianceEvent[];
      preferences?: AtlasNotificationPreferences;
      counts?: typeof counts;
    }>(`/api/fiscal-calendar?companyId=${encodeURIComponent(cid)}`);
    if (!result.ok) {
      setLoadError(result.error);
      setDeadlines([]);
    } else {
      setDeadlines(result.data.deadlines ?? []);
      setEvents(result.data.events ?? []);
      setPreferences(result.data.preferences ?? null);
      setCounts(result.data.counts ?? { red: 0, orange: 0, green: 0, total: 0, filed: 0 });
      if (result.data.preferences) setPrefsForm(result.data.preferences);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => { setCompanyId(cid); if (cid) void load(cid); });
    return off;
  }, [load]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return deadlines;
    return deadlines.filter((d) => d.category === categoryFilter);
  }, [deadlines, categoryFilter]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const eventsByDay = useMemo(() => {
    const map = new Map<number, AtlasTaxDeadline[]>();
    for (const d of filtered) {
      if (d.status === 'filed' || d.status === 'waived') continue;
      const dt = new Date(`${d.dueDate}T12:00:00`);
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        const day = dt.getDate();
        const list = map.get(day) ?? [];
        list.push(d);
        map.set(day, list);
      }
    }
    return map;
  }, [filtered, year, month]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < (firstDow === 0 ? 6 : firstDow - 1); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];

  const postAction = async (payload: Record<string, unknown>) => {
    if (!companyId) return;
    await fetch('/api/fiscal-calendar', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...payload }),
    });
    await load(companyId);
  };

  const markFiled = async (id: string) => {
    await postAction({ action: 'mark_filed', deadlineId: id });
  };

  const savePreferences = async () => {
    await postAction({ action: 'update_preferences', ...prefsForm });
    setShowPrefs(false);
  };

  const triggerAlerts = async () => {
    await postAction({ action: 'trigger_alerts' });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Calendrier fiscal interactif</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">TVA, IS, IR, CNSS — échéances et rappels automatiques</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowPrefs(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <Settings2 size={14} /> Alertes
              </button>
              <button type="button" onClick={() => void triggerAlerts()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B2A4A] text-white">
                <Bell size={14} /> Envoyer rappels
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="le calendrier fiscal" />}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Kpi label="Urgent (≤7j)" value={String(counts.red)} accent="text-red-600" />
            <Kpi label="Attention (≤21j)" value={String(counts.orange)} accent="text-orange-600" />
            <Kpi label="Planifié" value={String(counts.green)} accent="text-green-600" />
            <Kpi label="Actives" value={String(counts.total)} />
            <Kpi label="Déposées" value={String(counts.filed)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')} label="Toutes" />
            {ALL_CATEGORIES.map((c) => (
              <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)} label={categoryLabelFr(c)} />
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-[#1B2A4A]" />
                    <h2 className="font-semibold text-sm text-gray-700 capitalize">{monthLabel}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => { setViewDate(new Date(year, month - 1, 1)); setSelectedDay(null); }} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft size={16} /></button>
                    <button type="button" onClick={() => { setViewDate(new Date()); setSelectedDay(new Date().getDate()); }} className="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-600">Aujourd&apos;hui</button>
                    <button type="button" onClick={() => { setViewDate(new Date(year, month + 1, 1)); setSelectedDay(null); }} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight size={16} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                    <div key={d} className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 py-2">{d}</div>
                  ))}
                  {cells.map((day, i) => {
                    const dayEvents = day ? eventsByDay.get(day) ?? [] : [];
                    const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                    const isSelected = day === selectedDay;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!day}
                        onClick={() => day && setSelectedDay(day)}
                        className={`bg-white min-h-[4.5rem] p-1.5 text-left text-xs transition-colors ${!day ? 'bg-gray-50/50 cursor-default' : 'hover:bg-blue-50/50 cursor-pointer'} ${isToday ? 'ring-1 ring-inset ring-blue-400' : ''} ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-500' : ''}`}
                      >
                        {day && <span className={`font-semibold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day}</span>}
                        <div className="mt-1 space-y-0.5">
                          {dayEvents.slice(0, 2).map((ev) => (
                            <div key={ev.id} className="truncate text-[10px] text-gray-600 flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_STYLE[ev.severity].dot}`} />
                              {categoryLabelFr(ev.category)}
                            </div>
                          ))}
                          {dayEvents.length > 2 && <p className="text-[9px] text-gray-400">+{dayEvents.length - 2}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <h3 className="font-semibold text-sm text-gray-800 mb-3">
                    {selectedDay ? `${selectedDay} ${monthLabel}` : 'Prochaines échéances'}
                  </h3>
                  <ul className="space-y-2 max-h-80 overflow-y-auto">
                    {(selectedDay ? selectedEvents : filtered.filter((d) => d.status !== 'filed').slice(0, 8)).map((d) => (
                      <li key={d.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${SEVERITY_STYLE[d.severity].badge}`}>
                              {categoryLabelFr(d.category)}
                            </span>
                            <p className="font-medium text-gray-800 mt-1">{d.labelFr}</p>
                            <p className="text-xs text-gray-500">{d.dueDate} · J-{d.daysRemaining}</p>
                          </div>
                          <span className="text-[10px] text-gray-400">{STATUS_LABELS[d.status]}</span>
                        </div>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <button type="button" onClick={() => router.push(d.href)} className="text-xs text-blue-600 hover:underline">Préparer</button>
                          {d.externalUrl && (
                            <a href={d.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-gray-500 hover:underline inline-flex items-center gap-0.5">
                              DGI/CNSS <ExternalLink size={10} />
                            </a>
                          )}
                          {d.status !== 'filed' && (
                            <button type="button" onClick={() => void markFiled(d.id)} className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-0.5">
                              <CheckCircle2 size={12} /> Marquer déposé
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                    {!selectedDay && filtered.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">Aucune échéance</p>
                    )}
                  </ul>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <h3 className="font-semibold text-sm text-gray-800 mb-2">Journal de conformité</h3>
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto text-xs text-gray-600">
                    {events.length === 0 && <li className="text-gray-400 py-4 text-center">Aucun événement</li>}
                    {events.map((e) => (
                      <li key={e.id} className="flex justify-between gap-2 border-b border-gray-50 pb-1">
                        <span className="truncate">{e.title}</span>
                        <span className="text-gray-400 shrink-0">{e.createdAt.slice(0, 10)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {showPrefs && (
          <Modal title="Préférences d'alertes fiscales" onClose={() => setShowPrefs(false)} onSubmit={() => void savePreferences()} submitLabel="Enregistrer">
            <p className="text-xs text-gray-500">Rappels email/WhatsApp aux managers et à l&apos;expert-comptable (J-21, 14, 7, 3, 1).</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefsForm.emailEnabled !== false} onChange={(e) => setPrefsForm({ ...prefsForm, emailEnabled: e.target.checked })} /> Email</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefsForm.whatsappEnabled !== false} onChange={(e) => setPrefsForm({ ...prefsForm, whatsappEnabled: e.target.checked })} /> WhatsApp</label>
            <input value={prefsForm.accountantEmail ?? ''} onChange={(e) => setPrefsForm({ ...prefsForm, accountantEmail: e.target.value })} placeholder="Email expert-comptable" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={prefsForm.accountantPhone ?? ''} onChange={(e) => setPrefsForm({ ...prefsForm, accountantPhone: e.target.value })} placeholder="WhatsApp comptable (E.164)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={prefsForm.accountantName ?? ''} onChange={(e) => setPrefsForm({ ...prefsForm, accountantName: e.target.value })} placeholder="Nom du cabinet / comptable" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={prefsForm.managerEmail ?? ''} onChange={(e) => setPrefsForm({ ...prefsForm, managerEmail: e.target.value })} placeholder="Email manager (override)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-2">
              {DEFAULT_FISCAL_CATEGORIES.map((c) => (
                <label key={c} className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={(prefsForm.categories ?? [...DEFAULT_FISCAL_CATEGORIES]).includes(c)}
                    onChange={(e) => {
                      const cur = prefsForm.categories ?? [...DEFAULT_FISCAL_CATEGORIES];
                      setPrefsForm({
                        ...prefsForm,
                        categories: e.target.checked ? [...cur, c] : cur.filter((x) => x !== c),
                      });
                    }}
                  />
                  {categoryLabelFr(c as FiscalDeadlineCategory)}
                </label>
              ))}
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${accent ?? 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${active ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
    >
      {label}
    </button>
  );
}

function Modal({ title, children, onClose, onSubmit, submitLabel = 'Enregistrer' }: { title: string; children: ReactNode; onClose: () => void; onSubmit: () => void; submitLabel?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
          <button type="button" onClick={onSubmit} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}
