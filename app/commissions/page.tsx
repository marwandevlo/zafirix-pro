'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  BadgePercent,
  Loader2,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
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
  AgentPerformance,
  AtlasBrokerTier,
  AtlasCommissionEntry,
  AtlasCommissionRule,
  AtlasSalesAgent,
  CommissionsDashboard,
} from '@/app/types/atlas-commissions';
import { AGENT_TYPE_LABELS, BASIS_LABELS, STATUS_LABELS } from '@/app/types/atlas-commissions';

type Tab = 'dashboard' | 'agents' | 'entries' | 'rules' | 'tiers';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

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

export default function CommissionsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [agents, setAgents] = useState<AtlasSalesAgent[]>([]);
  const [tiers, setTiers] = useState<AtlasBrokerTier[]>([]);
  const [rules, setRules] = useState<AtlasCommissionRule[]>([]);
  const [entries, setEntries] = useState<AtlasCommissionEntry[]>([]);
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [stats, setStats] = useState<CommissionsDashboard['stats']>({
    totalPending: 0, totalApproved: 0, totalPaid: 0, activeAgents: 0, entriesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentForm, setAgentForm] = useState({ name: '', code: '', email: '', tierId: '', agentType: 'sales' });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<CommissionsDashboard>(
      `/api/commissions?companyId=${encodeURIComponent(cid)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
    } else {
      setAgents(result.data.agents ?? []);
      setTiers(result.data.tiers ?? []);
      setRules(result.data.rules ?? []);
      setEntries(result.data.entries ?? []);
      setPerformance(result.data.performance ?? []);
      setStats(result.data.stats ?? { totalPending: 0, totalApproved: 0, totalPaid: 0, activeAgents: 0, entriesCount: 0 });
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

  const sync = async () => {
    if (!companyId) return;
    setSyncing(true);
    await fetch('/api/commissions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', companyId }),
    });
    await load(companyId);
    setSyncing(false);
  };

  const createAgent = async () => {
    if (!companyId || !agentForm.name.trim() || !agentForm.code.trim()) return;
    await fetch('/api/commissions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_agent',
        companyId,
        name: agentForm.name.trim(),
        code: agentForm.code.trim(),
        email: agentForm.email || undefined,
        tierId: agentForm.tierId || undefined,
        agentType: agentForm.agentType,
      }),
    });
    setShowAgentForm(false);
    setAgentForm({ name: '', code: '', email: '', tierId: '', agentType: 'sales' });
    await load(companyId);
  };

  const updateStatus = async (entryId: string, status: 'approved' | 'paid') => {
    if (!companyId) return;
    await fetch('/api/commissions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_entry_status', companyId, entryId, status }),
    });
    await load(companyId);
  };

  const seedTiers = async () => {
    if (!companyId) return;
    await fetch('/api/commissions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed_tiers', companyId }),
    });
    await load(companyId);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Commissions & courtage</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Règles, paliers brokers et calcul automatique sur factures / paiements</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={syncing} onClick={() => void sync()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Recalculer
              </button>
              <button type="button" onClick={() => setShowAgentForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                <UserPlus size={14} /> Nouvel agent
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="les commissions" />}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Commissions en attente</p>
              <p className="text-xl font-bold text-amber-600">{formatMad(stats.totalPending)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Approuvées</p>
              <p className="text-xl font-bold text-blue-600">{formatMad(stats.totalApproved)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Payées</p>
              <p className="text-xl font-bold text-green-600">{formatMad(stats.totalPaid)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Agents actifs</p>
              <p className="text-2xl font-bold">{stats.activeAgents}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}><TrendingUp size={12} className="inline mr-1" />Performance</TabButton>
            <TabButton active={tab === 'agents'} onClick={() => setTab('agents')}><Users size={12} className="inline mr-1" />Agents</TabButton>
            <TabButton active={tab === 'entries'} onClick={() => setTab('entries')}><Wallet size={12} className="inline mr-1" />Commissions</TabButton>
            <TabButton active={tab === 'rules'} onClick={() => setTab('rules')}><BadgePercent size={12} className="inline mr-1" />Règles</TabButton>
            <TabButton active={tab === 'tiers'} onClick={() => setTab('tiers')}>Paliers</TabButton>
          </div>

          {showAgentForm && (
            <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold">Nouvel agent commercial</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Nom *" value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Code *" value={agentForm.code} onChange={(e) => setAgentForm({ ...agentForm, code: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Email" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} />
                <select className="border rounded-lg px-3 py-2 text-sm" value={agentForm.agentType} onChange={(e) => setAgentForm({ ...agentForm, agentType: e.target.value })}>
                  {Object.entries(AGENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="border rounded-lg px-3 py-2 text-sm sm:col-span-2" value={agentForm.tierId} onChange={(e) => setAgentForm({ ...agentForm, tierId: e.target.value })}>
                  <option value="">Palier (auto)</option>
                  {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.commissionRate}%)</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void createAgent()} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white">Enregistrer</button>
                <button type="button" onClick={() => setShowAgentForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border">Annuler</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <>
              {tab === 'dashboard' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3">Agent</th>
                        <th className="px-4 py-3">Palier</th>
                        <th className="px-4 py-3 text-right">CA facturé</th>
                        <th className="px-4 py-3 text-right">Encaissé</th>
                        <th className="px-4 py-3 text-right">Commission totale</th>
                        <th className="px-4 py-3 text-right">En attente</th>
                        <th className="px-4 py-3 text-right">Payée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Aucun agent — créez un agent et assignez-le aux factures</td></tr>
                      )}
                      {performance.map((p) => (
                        <tr key={p.agentId} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{p.agentName}<span className="block text-[10px] text-gray-400">{p.agentCode}</span></td>
                          <td className="px-4 py-3 text-xs">{p.tierName ?? '—'}</td>
                          <td className="px-4 py-3 text-right">{formatMad(p.totalSales)}</td>
                          <td className="px-4 py-3 text-right">{formatMad(p.totalCollected)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMad(p.commissionEarned)}</td>
                          <td className="px-4 py-3 text-right text-amber-600">{formatMad(p.commissionPending)}</td>
                          <td className="px-4 py-3 text-right text-green-600">{formatMad(p.commissionPaid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'agents' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3 text-left">Nom</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Palier</th>
                        <th className="px-4 py-3">Contact</th>
                        <th className="px-4 py-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a) => (
                        <tr key={a.id} className="border-b border-gray-50">
                          <td className="px-4 py-3 font-medium">{a.name}<span className="block text-[10px] text-gray-400">{a.code}</span></td>
                          <td className="px-4 py-3 text-xs">{AGENT_TYPE_LABELS[a.agentType]}</td>
                          <td className="px-4 py-3 text-xs">{a.tierName ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{a.email ?? a.phone ?? '—'}</td>
                          <td className="px-4 py-3 text-xs">{a.isActive ? 'Actif' : 'Inactif'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'entries' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3 text-left">Agent</th>
                        <th className="px-4 py-3">Facture</th>
                        <th className="px-4 py-3">Base</th>
                        <th className="px-4 py-3 text-right">Taux</th>
                        <th className="px-4 py-3 text-right">Commission</th>
                        <th className="px-4 py-3">Statut</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Aucune commission — assignez des agents aux factures puis recalculez</td></tr>
                      )}
                      {entries.map((e) => (
                        <tr key={e.id} className="border-b border-gray-50">
                          <td className="px-4 py-3">{e.agentName ?? e.agentId.slice(0, 8)}</td>
                          <td className="px-4 py-3 text-xs">
                            {e.invoiceNumber ?? '—'}
                            <span className="block text-gray-400">{BASIS_LABELS[e.basis]}</span>
                          </td>
                          <td className="px-4 py-3 text-right">{formatMad(e.baseAmount)}</td>
                          <td className="px-4 py-3 text-right">{e.ratePct}%</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMad(e.commissionAmount + e.tierBonus)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[e.status]}`}>{STATUS_LABELS[e.status]}</span>
                          </td>
                          <td className="px-4 py-3">
                            {e.status === 'pending' && (
                              <button type="button" onClick={() => void updateStatus(e.id, 'approved')} className="text-xs text-indigo-600 hover:underline">Approuver</button>
                            )}
                            {e.status === 'approved' && (
                              <button type="button" onClick={() => void updateStatus(e.id, 'paid')} className="text-xs text-green-600 hover:underline">Marquer payé</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'rules' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3 text-left">Règle</th>
                        <th className="px-4 py-3">Base</th>
                        <th className="px-4 py-3 text-right">Taux</th>
                        <th className="px-4 py-3">Priorité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50">
                          <td className="px-4 py-3 font-medium">{r.name}</td>
                          <td className="px-4 py-3 text-xs">{BASIS_LABELS[r.basis]}</td>
                          <td className="px-4 py-3 text-right">{r.rateType === 'percent' ? `${r.rateValue}%` : formatMad(r.rateValue)}</td>
                          <td className="px-4 py-3 text-center text-xs">{r.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'tiers' && (
                <div className="space-y-4">
                  {tiers.length === 0 && (
                    <button type="button" onClick={() => void seedTiers()} className="text-sm text-indigo-600 hover:underline">Initialiser les paliers Bronze → Platinum</button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {tiers.map((t) => (
                      <div key={t.id} className="bg-white rounded-xl border p-4 shadow-sm">
                        <p className="font-bold text-gray-800">{t.name}</p>
                        <p className="text-2xl font-bold text-indigo-600 mt-1">{t.commissionRate}%</p>
                        <p className="text-xs text-gray-400 mt-2">CA min : {formatMad(t.minSalesMad)}</p>
                        <p className="text-xs text-gray-400">Encaissé min : {formatMad(t.minCollectedMad)}</p>
                        {t.bonusRate > 0 && <p className="text-xs text-emerald-600 mt-1">Bonus +{t.bonusRate}%</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
