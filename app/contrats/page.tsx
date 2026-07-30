'use client';

import { useCallback, useEffect, useState, Fragment, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  History,
  Loader2,
  Plus,
  RefreshCw,
  XCircle,
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
  AtlasContract,
  AtlasContractEvent,
  ContractDashboardSummary,
  ContractStatus,
  ContractType,
} from '@/app/types/atlas-contracts';
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  PARTY_ROLE_LABELS,
} from '@/app/types/atlas-contracts';

type Tab = ContractStatus | 'all';

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-800',
  expiring: 'bg-orange-100 text-orange-800',
  terminated: 'bg-red-100 text-red-800',
  renewed: 'bg-indigo-100 text-indigo-800',
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

function formatMad(n: number | null, currency = 'MAD'): string {
  if (n == null) return '—';
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default function ContratsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [contracts, setContracts] = useState<AtlasContract[]>([]);
  const [summary, setSummary] = useState<ContractDashboardSummary>({
    active: 0, expiring: 0, terminated: 0, draft: 0, renewed: 0, total: 0, totalValue: 0,
  });
  const [events, setEvents] = useState<AtlasContractEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    reference: '',
    contractType: 'commercial' as ContractType,
    effectiveDate: '',
    expiryDate: '',
    renewalDate: '',
    renewalTerms: '',
    autoRenew: false,
    contractValue: '',
    partyName: '',
    partyRole: 'client',
    attachmentName: '',
    attachmentUrl: '',
  });

  const load = useCallback(async (cid: string, status: Tab) => {
    setLoading(true);
    setLoadError(null);
    const statusParam = status === 'all' ? 'all' : status;
    const result = await fetchEnterpriseModule<{
      contracts?: AtlasContract[];
      summary?: ContractDashboardSummary;
      events?: AtlasContractEvent[];
    }>(`/api/contracts?companyId=${encodeURIComponent(cid)}&status=${statusParam}`);
    if (!result.ok) {
      setLoadError(result.error);
      setContracts([]);
    } else {
      setContracts(result.data.contracts ?? []);
      setSummary(result.data.summary ?? { active: 0, expiring: 0, terminated: 0, draft: 0, renewed: 0, total: 0, totalValue: 0 });
      setEvents(result.data.events ?? []);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid, tab);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => { setCompanyId(cid); if (cid) void load(cid, tab); });
    return off;
  }, [load, tab]);

  const syncFromLegal = async () => {
    if (!companyId) return;
    setSyncing(true);
    await fetch('/api/contracts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', companyId }),
    });
    await load(companyId, tab);
    setSyncing(false);
  };

  const createContract = async () => {
    if (!companyId || !form.title.trim()) return;
    await fetch('/api/contracts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        companyId,
        title: form.title.trim(),
        reference: form.reference || undefined,
        contractType: form.contractType,
        effectiveDate: form.effectiveDate || undefined,
        expiryDate: form.expiryDate || undefined,
        renewalDate: form.renewalDate || undefined,
        renewalTerms: form.renewalTerms || undefined,
        autoRenew: form.autoRenew,
        contractValue: form.contractValue ? parseFloat(form.contractValue) : undefined,
        parties: form.partyName.trim()
          ? [{ partyName: form.partyName.trim(), partyRole: form.partyRole }]
          : undefined,
        attachments: form.attachmentName.trim()
          ? [{ fileName: form.attachmentName.trim(), fileUrl: form.attachmentUrl || undefined }]
          : undefined,
      }),
    });
    setShowForm(false);
    setForm({
      title: '', reference: '', contractType: 'commercial', effectiveDate: '', expiryDate: '',
      renewalDate: '', renewalTerms: '', autoRenew: false, contractValue: '',
      partyName: '', partyRole: 'client', attachmentName: '', attachmentUrl: '',
    });
    await load(companyId, tab);
  };

  const terminate = async (id: string) => {
    if (!companyId) return;
    await fetch('/api/contracts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'terminate', companyId, contractId: id, reason: 'Résiliation manuelle' }),
    });
    await load(companyId, tab);
  };

  const renew = async (id: string) => {
    if (!companyId) return;
    const newExpiry = prompt('Nouvelle date d\'expiration (AAAA-MM-JJ) :');
    if (!newExpiry) return;
    await fetch('/api/contracts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renew', companyId, contractId: id, newExpiryDate: newExpiry }),
    });
    await load(companyId, tab);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Gestion des contrats</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Suivi actif, échéances, renouvellements et pièces jointes</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={syncing}
                onClick={() => void syncFromLegal()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Importer Documents IA
              </button>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <Plus size={14} /> Nouveau contrat
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="les contrats" />}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Contrats actifs</p>
              <p className="text-2xl font-bold text-green-600">{summary.active}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Expirent bientôt</p>
              <p className="text-2xl font-bold text-orange-600">{summary.expiring}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Résiliés</p>
              <p className="text-2xl font-bold text-red-600">{summary.terminated}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Valeur encours</p>
              <p className="text-lg font-bold">{formatMad(summary.totalValue)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Actifs ({summary.active})</span>
            </TabButton>
            <TabButton active={tab === 'expiring'} onClick={() => setTab('expiring')}>
              <span className="inline-flex items-center gap-1"><AlertTriangle size={12} /> Expirent bientôt ({summary.expiring})</span>
            </TabButton>
            <TabButton active={tab === 'terminated'} onClick={() => setTab('terminated')}>
              <span className="inline-flex items-center gap-1"><XCircle size={12} /> Résiliés ({summary.terminated})</span>
            </TabButton>
            <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
              <span className="inline-flex items-center gap-1"><FileSignature size={12} /> Tous ({summary.total})</span>
            </TabButton>
          </div>

          {showForm && (
            <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Nouveau contrat</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Titre *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Référence" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                <select className="border rounded-lg px-3 py-2 text-sm" value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value as ContractType })}>
                  {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="border rounded-lg px-3 py-2 text-sm" type="number" placeholder="Montant" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" type="date" placeholder="Date effet" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" type="date" placeholder="Expiration" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" type="date" placeholder="Date renouvellement" value={form.renewalDate} onChange={(e) => setForm({ ...form, renewalDate: e.target.value })} />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={form.autoRenew} onChange={(e) => setForm({ ...form, autoRenew: e.target.checked })} />
                  Renouvellement automatique
                </label>
                <textarea className="border rounded-lg px-3 py-2 text-sm sm:col-span-2" placeholder="Conditions de renouvellement" rows={2} value={form.renewalTerms} onChange={(e) => setForm({ ...form, renewalTerms: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Partie contractante" value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} />
                <select className="border rounded-lg px-3 py-2 text-sm" value={form.partyRole} onChange={(e) => setForm({ ...form, partyRole: e.target.value })}>
                  {Object.entries(PARTY_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Pièce jointe (nom)" value={form.attachmentName} onChange={(e) => setForm({ ...form, attachmentName: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="URL document" value={form.attachmentUrl} onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void createContract()} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white">Enregistrer</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border">Annuler</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                      <th className="px-4 py-3">Contrat</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Parties</th>
                      <th className="px-4 py-3">Expiration</th>
                      <th className="px-4 py-3">Renouvellement</th>
                      <th className="px-4 py-3 text-right">Valeur</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Aucun contrat — créez-en un ou importez depuis Documents IA</td></tr>
                    )}
                    {contracts.map((c) => (
                      <Fragment key={c.id}>
                        <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-700">{c.title}</p>
                            {c.reference && <p className="text-[10px] text-gray-400">{c.reference}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs">{CONTRACT_TYPE_LABELS[c.contractType]}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {c.parties.length > 0 ? c.parties.map((p) => p.partyName).join(', ') : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {c.expiryDate ?? '—'}
                            {c.daysUntilExpiry != null && c.daysUntilExpiry >= 0 && (
                              <span className="block text-gray-400">J-{c.daysUntilExpiry}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {c.renewalDate ?? '—'}
                            {c.autoRenew && <span className="block text-emerald-600">Auto</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMad(c.contractValue, c.currency)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[c.computedStatus]}`}>
                              {CONTRACT_STATUS_LABELS[c.computedStatus]}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {c.computedStatus !== 'terminated' && c.computedStatus !== 'renewed' && (
                              <div className="flex gap-2">
                                <button type="button" onClick={() => void renew(c.id)} className="text-xs text-indigo-600 hover:underline">Renouveler</button>
                                <button type="button" onClick={() => void terminate(c.id)} className="text-xs text-red-600 hover:underline">Résilier</button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {expandedId === c.id && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="font-semibold text-gray-600 mb-1">Conditions de renouvellement</p>
                                  <p className="text-gray-500">{c.renewalTerms || 'Non renseignées'}</p>
                                  {c.notes && <p className="mt-2 text-gray-500">{c.notes}</p>}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-600 mb-1">Pièces jointes ({c.attachments.length})</p>
                                  {c.attachments.length === 0 ? (
                                    <p className="text-gray-400">Aucune pièce</p>
                                  ) : (
                                    <ul className="space-y-1">
                                      {c.attachments.map((a) => (
                                        <li key={a.id}>
                                          {a.fileUrl ? (
                                            <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{a.fileName}</a>
                                          ) : (
                                            <span>{a.fileName}</span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                  <History size={14} className="text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700">Historique alertes & événements</h2>
                </div>
                <div className="divide-y max-h-48 overflow-y-auto">
                  {events.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun événement enregistré</p>
                  )}
                  {events.map((ev) => (
                    <div key={ev.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{ev.title}</p>
                        {ev.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.body}</p>}
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{new Date(ev.createdAt).toLocaleString('fr-FR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
