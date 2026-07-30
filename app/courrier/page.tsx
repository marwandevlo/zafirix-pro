'use client';

import { useCallback, useEffect, useState, Fragment, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Loader2,
  Mail,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type {
  AtlasCorrespondence,
  AtlasCorrespondenceEvent,
  CorrespondenceDirection,
  CorrespondenceLetterType,
  CorrespondencePriority,
  CorrespondenceStatus,
  CourrierDashboardSummary,
} from '@/app/types/atlas-courrier';
import {
  DIRECTION_LABELS,
  LETTER_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '@/app/types/atlas-courrier';

type Tab = 'all' | 'incoming' | 'outgoing' | 'history';

const STATUS_COLORS: Record<CorrespondenceStatus, string> = {
  registered: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  replied: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-800',
};

const PRIORITY_COLORS: Record<CorrespondencePriority, string> = {
  low: 'text-gray-500',
  normal: 'text-gray-700',
  high: 'text-orange-600 font-medium',
  urgent: 'text-red-600 font-semibold',
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(`${d}T12:00:00`).toLocaleDateString('fr-MA');
}

function partyLabel(item: AtlasCorrespondence): string {
  if (item.direction === 'incoming') {
    return item.senderOrganization || item.senderName || '—';
  }
  return item.recipientOrganization || item.recipientName || '—';
}

export default function CourrierPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<AtlasCorrespondence[]>([]);
  const [summary, setSummary] = useState<CourrierDashboardSummary>({
    total: 0, incoming: 0, outgoing: 0, registered: 0, inProgress: 0,
    replied: 0, archived: 0, overdueResponses: 0, urgent: 0,
  });
  const [events, setEvents] = useState<AtlasCorrespondenceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    direction: 'incoming' as CorrespondenceDirection,
    subject: '',
    letterType: 'administrative' as CorrespondenceLetterType,
    priority: 'normal' as CorrespondencePriority,
    correspondenceDate: new Date().toISOString().slice(0, 10),
    externalReference: '',
    responseDueDate: '',
    senderName: '',
    senderOrganization: '',
    recipientName: '',
    recipientOrganization: '',
    assignedTo: '',
    summary: '',
    notes: '',
    attachmentName: '',
    attachmentUrl: '',
  });

  const load = useCallback(async (cid: string, currentTab: Tab, q: string) => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ companyId: cid });
    if (currentTab === 'incoming') params.set('direction', 'incoming');
    else if (currentTab === 'outgoing') params.set('direction', 'outgoing');
    if (q) params.set('q', q);

    const result = await fetchEnterpriseModule<{
      items?: AtlasCorrespondence[];
      summary?: CourrierDashboardSummary;
      events?: AtlasCorrespondenceEvent[];
    }>(`/api/courrier?${params.toString()}`);

    if (!result.ok) {
      setLoadError(result.error);
      setItems([]);
    } else {
      setItems(result.data.items ?? []);
      setSummary(result.data.summary ?? {
        total: 0, incoming: 0, outgoing: 0, registered: 0, inProgress: 0,
        replied: 0, archived: 0, overdueResponses: 0, urgent: 0,
      });
      setEvents(result.data.events ?? []);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid, tab, search);
    })();
  }, [load, tab, search]);

  useEffect(() => {
    return onCompanySwitched(() => {
      void (async () => {
        const cid = await getActiveCompanyDbRowId();
        setCompanyId(cid);
        if (cid) await load(cid, tab, search);
      })();
    });
  }, [load, tab, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleCreate = async () => {
    if (!companyId || !form.subject.trim()) return;
    setSubmitting(true);
    try {
      const attachments =
        form.attachmentName.trim()
          ? [{ fileName: form.attachmentName.trim(), fileUrl: form.attachmentUrl.trim() || undefined }]
          : undefined;

      const res = await fetch('/api/courrier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'create',
          companyId,
          direction: form.direction,
          subject: form.subject,
          letterType: form.letterType,
          priority: form.priority,
          correspondenceDate: form.correspondenceDate,
          externalReference: form.externalReference || undefined,
          responseDueDate: form.responseDueDate || undefined,
          senderName: form.senderName || undefined,
          senderOrganization: form.senderOrganization || undefined,
          recipientName: form.recipientName || undefined,
          recipientOrganization: form.recipientOrganization || undefined,
          assignedTo: form.assignedTo || undefined,
          summary: form.summary || undefined,
          notes: form.notes || undefined,
          attachments,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'create_failed');
      setShowForm(false);
      setForm({
        direction: 'incoming',
        subject: '',
        letterType: 'administrative',
        priority: 'normal',
        correspondenceDate: new Date().toISOString().slice(0, 10),
        externalReference: '',
        responseDueDate: '',
        senderName: '',
        senderOrganization: '',
        recipientName: '',
        recipientOrganization: '',
        assignedTo: '',
        summary: '',
        notes: '',
        attachmentName: '',
        attachmentUrl: '',
      });
      await load(companyId, tab, search);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: CorrespondenceStatus) => {
    if (!companyId) return;
    const res = await fetch('/api/courrier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'update_status', companyId, correspondenceId: id, status }),
    });
    const data = await res.json();
    if (data.ok) await load(companyId, tab, search);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Mail className="h-6 w-6 text-indigo-600" />
                <h1 className="text-xl font-semibold text-gray-900">Courrier Arrivé / Départ</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Registre officiel, pièces jointes numériques et suivi du flux administratif.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Enregistrer un courrier
            </button>
          </div>

          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="le courrier" />}
          {loadError && <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-semibold">{summary.total}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <ArrowDownLeft className="h-3 w-3" /> Arrivé
              </p>
              <p className="text-2xl font-semibold text-blue-700">{summary.incoming}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" /> Départ
              </p>
              <p className="text-2xl font-semibold text-indigo-700">{summary.outgoing}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-500" /> Réponses en retard
              </p>
              <p className="text-2xl font-semibold text-red-600">{summary.overdueResponses}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TabButton active={tab === 'all'} onClick={() => setTab('all')}>Tous</TabButton>
            <TabButton active={tab === 'incoming'} onClick={() => setTab('incoming')}>Arrivé</TabButton>
            <TabButton active={tab === 'outgoing'} onClick={() => setTab('outgoing')}>Départ</TabButton>
            <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
              <span className="inline-flex items-center gap-1"><History className="h-3 w-3" /> Historique</span>
            </TabButton>
          </div>

          {tab !== 'history' && (
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Rechercher réf., objet, expéditeur, destinataire…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg"
                />
              </div>
              <button type="submit" className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
                Rechercher
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchInput(''); }}
                  className="px-2 py-2 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : tab === 'history' ? (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Événement</th>
                    <th className="px-4 py-3">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Aucun événement.</td></tr>
                  ) : events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {new Date(ev.createdAt).toLocaleString('fr-MA')}
                      </td>
                      <td className="px-4 py-3 font-medium">{ev.title}</td>
                      <td className="px-4 py-3 text-gray-600">{ev.body ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Réf.</th>
                    <th className="px-4 py-3">Sens</th>
                    <th className="px-4 py-3">Objet</th>
                    <th className="px-4 py-3">Correspondant</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun courrier enregistré.</td></tr>
                  ) : items.map((item) => (
                    <Fragment key={item.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{item.referenceNumber}</td>
                        <td className="px-4 py-3">
                          {item.direction === 'incoming' ? (
                            <span className="inline-flex items-center gap-1 text-blue-700">
                              <ArrowDownLeft className="h-3.5 w-3.5" /> Arrivé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-indigo-700">
                              <ArrowUpRight className="h-3.5 w-3.5" /> Départ
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate" title={item.subject}>
                          <span className={PRIORITY_COLORS[item.priority]}>{item.subject}</span>
                          <span className="block text-xs text-gray-400">{LETTER_TYPE_LABELS[item.letterType]}</span>
                        </td>
                        <td className="px-4 py-3">{partyLabel(item)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(item.correspondenceDate)}
                          {item.responseDueDate && item.daysUntilResponseDue != null && item.daysUntilResponseDue < 0 && (
                            <span className="block text-xs text-red-600">Échéance dépassée</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[item.status]}`}>
                            {STATUS_LABELS[item.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="text-xs border border-gray-200 rounded px-1 py-0.5"
                            value={item.status}
                            onChange={(e) => void handleStatusChange(item.id, e.target.value as CorrespondenceStatus)}
                          >
                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      {expandedId === item.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="font-medium text-gray-700 mb-1">Expéditeur</p>
                                <p>{item.senderOrganization ?? item.senderName ?? '—'}</p>
                                {item.senderEmail && <p className="text-gray-500">{item.senderEmail}</p>}
                                {item.senderPhone && <p className="text-gray-500">{item.senderPhone}</p>}
                              </div>
                              <div>
                                <p className="font-medium text-gray-700 mb-1">Destinataire</p>
                                <p>{item.recipientOrganization ?? item.recipientName ?? '—'}</p>
                                {item.recipientEmail && <p className="text-gray-500">{item.recipientEmail}</p>}
                              </div>
                              {item.summary && (
                                <div className="md:col-span-2">
                                  <p className="font-medium text-gray-700 mb-1">Résumé</p>
                                  <p className="text-gray-600">{item.summary}</p>
                                </div>
                              )}
                              {item.notes && (
                                <div className="md:col-span-2">
                                  <p className="font-medium text-gray-700 mb-1">Notes internes</p>
                                  <p className="text-gray-600">{item.notes}</p>
                                </div>
                              )}
                              {item.assignedTo && (
                                <p className="text-gray-600">Assigné à : <strong>{item.assignedTo}</strong></p>
                              )}
                              {item.externalReference && (
                                <p className="text-gray-600">Réf. externe : {item.externalReference}</p>
                              )}
                              {item.responseDueDate && (
                                <p className="text-gray-600">
                                  Réponse avant : {formatDate(item.responseDueDate)}
                                  {item.daysUntilResponseDue != null && (
                                    <span className="ml-1 text-xs">({item.daysUntilResponseDue} j)</span>
                                  )}
                                </p>
                              )}
                              {item.attachments.length > 0 && (
                                <div className="md:col-span-2">
                                  <p className="font-medium text-gray-700 mb-1">Pièces jointes</p>
                                  <ul className="space-y-1">
                                    {item.attachments.map((a) => (
                                      <li key={a.id}>
                                        {a.fileUrl ? (
                                          <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                            {a.fileName}
                                          </a>
                                        ) : (
                                          <span>{a.fileName}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Enregistrer un courrier</h2>
                  <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block col-span-2 sm:col-span-1">
                    <span className="text-xs text-gray-500">Sens *</span>
                    <select
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.direction}
                      onChange={(e) => setForm({ ...form, direction: e.target.value as CorrespondenceDirection })}
                    >
                      <option value="incoming">{DIRECTION_LABELS.incoming}</option>
                      <option value="outgoing">{DIRECTION_LABELS.outgoing}</option>
                    </select>
                  </label>
                  <label className="block col-span-2 sm:col-span-1">
                    <span className="text-xs text-gray-500">Type</span>
                    <select
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.letterType}
                      onChange={(e) => setForm({ ...form, letterType: e.target.value as CorrespondenceLetterType })}
                    >
                      {Object.entries(LETTER_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block col-span-2">
                    <span className="text-xs text-gray-500">Objet *</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Date du courrier</span>
                    <input
                      type="date"
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.correspondenceDate}
                      onChange={(e) => setForm({ ...form, correspondenceDate: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Priorité</span>
                    <select
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value as CorrespondencePriority })}
                    >
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Réf. externe</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.externalReference}
                      onChange={(e) => setForm({ ...form, externalReference: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Date limite de réponse</span>
                    <input
                      type="date"
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.responseDueDate}
                      onChange={(e) => setForm({ ...form, responseDueDate: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Expéditeur (nom)</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.senderName}
                      onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Expéditeur (organisme)</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.senderOrganization}
                      onChange={(e) => setForm({ ...form, senderOrganization: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Destinataire (nom)</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.recipientName}
                      onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Destinataire (organisme)</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.recipientOrganization}
                      onChange={(e) => setForm({ ...form, recipientOrganization: e.target.value })}
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="text-xs text-gray-500">Assigné à</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.assignedTo}
                      onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="text-xs text-gray-500">Résumé</span>
                    <textarea
                      rows={2}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.summary}
                      onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="text-xs text-gray-500">Notes internes</span>
                    <textarea
                      rows={2}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Pièce jointe (nom)</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.attachmentName}
                      onChange={(e) => setForm({ ...form, attachmentName: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Pièce jointe (URL)</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.attachmentUrl}
                      onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })}
                      placeholder="https://… ou lien Documents IA"
                    />
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !form.subject.trim()}
                    onClick={() => void handleCreate()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
