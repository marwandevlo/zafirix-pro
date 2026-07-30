'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  History,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { RowShareActionBar } from '@/app/components/share';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type { AtlasDebtCollectionCase } from '@/app/types/atlas-enterprise-modules';
import type {
  AtlasClientRiskProfile,
  AtlasDebtFollowUp,
  DebtAgingSummary,
} from '@/app/types/atlas-debt-collection';
import { AGING_LABELS, RISK_BAND_LABELS, STAGE_LABELS } from '@/app/types/atlas-debt-collection';

type Tab = 'dashboard' | 'cases' | 'risk' | 'followups';

const STAGE_COLORS: Record<string, string> = {
  reminder_1: 'bg-amber-100 text-amber-800',
  reminder_2: 'bg-orange-100 text-orange-800',
  formal_notice: 'bg-red-100 text-red-800',
  legal: 'bg-purple-100 text-purple-800',
  closed: 'bg-gray-100 text-gray-600',
  paid: 'bg-green-100 text-green-800',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  in_app: 'In-app',
  manual: 'Manuel',
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

export default function RecouvrementPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [cases, setCases] = useState<AtlasDebtCollectionCase[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [aging, setAging] = useState<DebtAgingSummary[]>([]);
  const [riskProfiles, setRiskProfiles] = useState<AtlasClientRiskProfile[]>([]);
  const [followUps, setFollowUps] = useState<AtlasDebtFollowUp[]>([]);
  const [stats, setStats] = useState({
    activeCases: 0,
    overdueInvoices: 0,
    highRiskClients: 0,
    remindersSentWeek: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{
      cases?: AtlasDebtCollectionCase[];
      totalDue?: number;
      aging?: DebtAgingSummary[];
      riskProfiles?: AtlasClientRiskProfile[];
      followUps?: AtlasDebtFollowUp[];
      stats?: typeof stats;
    }>(`/api/debt-collection?companyId=${encodeURIComponent(cid)}&view=dashboard`);
    if (!result.ok) {
      setLoadError(result.error);
      setCases([]);
      setTotalDue(0);
      setAging([]);
      setRiskProfiles([]);
      setFollowUps([]);
    } else {
      setCases(result.data.cases ?? []);
      setTotalDue(result.data.totalDue ?? 0);
      setAging(result.data.aging ?? []);
      setRiskProfiles(result.data.riskProfiles ?? []);
      setFollowUps(result.data.followUps ?? []);
      setStats(result.data.stats ?? { activeCases: 0, overdueInvoices: 0, highRiskClients: 0, remindersSentWeek: 0 });
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

  const syncOverdue = async () => {
    if (!companyId) return;
    setSyncing(true);
    await fetch('/api/debt-collection', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_overdue', companyId }),
    });
    await load(companyId);
    setSyncing(false);
  };

  const advanceCase = async (id: string) => {
    if (!companyId) return;
    await fetch('/api/debt-collection', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', companyId, id }),
    });
    await load(companyId);
  };

  const sendReminder = async (c: AtlasDebtCollectionCase, channels?: ('email' | 'whatsapp')[]) => {
    if (!companyId) return;
    setSendingId(c.id);
    await fetch('/api/debt-collection', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_reminder', companyId, id: c.id, channels }),
    });
    await load(companyId);
    setSendingId(null);
  };

  const activeCases = cases.filter((c) => c.stage !== 'paid' && c.stage !== 'closed');

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Recouvrement clients</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Aging, profils de risque et relances automatiques email / WhatsApp</p>
            </div>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void syncOverdue()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Importer impayés
            </button>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="le recouvrement" />}

          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
              <span className="inline-flex items-center gap-1"><BarChart3 size={12} /> Tableau de bord</span>
            </TabButton>
            <TabButton active={tab === 'cases'} onClick={() => setTab('cases')}>
              <span className="inline-flex items-center gap-1"><AlertTriangle size={12} /> Dossiers ({activeCases.length})</span>
            </TabButton>
            <TabButton active={tab === 'risk'} onClick={() => setTab('risk')}>
              <span className="inline-flex items-center gap-1"><ShieldAlert size={12} /> Clients à risque</span>
            </TabButton>
            <TabButton active={tab === 'followups'} onClick={() => setTab('followups')}>
              <span className="inline-flex items-center gap-1"><History size={12} /> Historique relances</span>
            </TabButton>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Dossiers actifs</p>
              <p className="text-2xl font-bold">{stats.activeCases}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Montant total dû</p>
              <p className="text-2xl font-bold text-red-600">{formatMad(totalDue)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Factures en retard</p>
              <p className="text-2xl font-bold text-orange-600">{stats.overdueInvoices}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Clients à risque élevé</p>
              <p className="text-2xl font-bold text-purple-600">{stats.highRiskClients}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <>
              {tab === 'dashboard' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border p-4">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Balance aging</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {aging.map((a) => (
                        <div key={a.bucket} className="rounded-lg border p-3 bg-gray-50">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">{a.label}</p>
                          <p className="text-lg font-bold mt-1">{formatMad(a.amount)}</p>
                          <p className="text-xs text-gray-500">{a.count} dossier{a.count !== 1 ? 's' : ''}</p>
                        </div>
                      ))}
                      {aging.length === 0 && (
                        <p className="col-span-full text-sm text-gray-400 py-4 text-center">Aucune créance — importez les impayés</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                        <Users size={14} className="text-gray-400" />
                        <h2 className="text-sm font-semibold text-gray-700">Top clients à risque</h2>
                      </div>
                      <div className="divide-y max-h-64 overflow-y-auto">
                        {riskProfiles.slice(0, 5).map((r) => (
                          <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-700">{r.clientName}</p>
                              <p className="text-xs text-gray-400">{r.overdueCount} impayé{r.overdueCount !== 1 ? 's' : ''} · max {r.maxDaysOverdue}j</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${RISK_COLORS[r.riskBand]}`}>
                                {RISK_BAND_LABELS[r.riskBand]}
                              </span>
                              <p className="text-xs font-semibold mt-1">{formatMad(r.totalOutstanding)}</p>
                            </div>
                          </div>
                        ))}
                        {riskProfiles.length === 0 && (
                          <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun profil de risque calculé</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                        <History size={14} className="text-gray-400" />
                        <h2 className="text-sm font-semibold text-gray-700">Relances récentes (7 jours)</h2>
                      </div>
                      <div className="divide-y max-h-64 overflow-y-auto">
                        {followUps.slice(0, 6).map((f) => (
                          <div key={f.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-medium text-indigo-600">{CHANNEL_LABELS[f.channel] ?? f.channel}</span>
                              <span className="text-[10px] text-gray-400">{new Date(f.sentAt).toLocaleString('fr-FR')}</span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{f.message}</p>
                          </div>
                        ))}
                        {followUps.length === 0 && (
                          <p className="px-4 py-8 text-center text-sm text-gray-400">Aucune relance cette semaine</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'cases' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Facture</th>
                        <th className="px-4 py-3 text-right">Solde dû</th>
                        <th className="px-4 py-3">Aging</th>
                        <th className="px-4 py-3">Étape</th>
                        <th className="px-4 py-3">Prochaine action</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Aucun dossier — importez les factures en retard</td></tr>
                      )}
                      {cases.map((c) => {
                        const outstanding = c.outstandingAmount ?? c.amountDue;
                        const stageLabel = c.stageLabel ?? STAGE_LABELS[c.stage];
                        return (
                          <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-700">{c.clientName}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {c.invoiceNumber ?? '—'}
                              {c.dueDate && <span className="block text-gray-400">Éch. {c.dueDate}</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{formatMad(outstanding)}</td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] text-gray-500">
                                {c.agingBucket ? AGING_LABELS[c.agingBucket] : '—'}
                                {(c.daysOverdue ?? 0) > 0 && ` (${c.daysOverdue}j)`}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[c.stage] ?? 'bg-gray-100'}`}>{stageLabel}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {c.nextActionAt ? new Date(c.nextActionAt).toLocaleDateString('fr-FR') : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <RowShareActionBar
                                entityLabel={`Recouvrement ${c.clientName}`}
                                whatsAppMessage={`Relance ${c.clientName} — ${formatMad(outstanding)} (${stageLabel})`}
                                onSendEmail={() => void sendReminder(c, ['email'])}
                                mailto={{
                                  subject: `Relance — ${c.clientName}`,
                                  body: `Bonjour ${c.clientName},\n\nNous vous rappelons le règlement de ${formatMad(outstanding)} (${stageLabel}).\n\nMerci de votre collaboration.`,
                                }}
                              >
                                {c.stage !== 'paid' && c.stage !== 'closed' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={sendingId === c.id}
                                      onClick={() => void sendReminder(c)}
                                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline shrink-0 disabled:opacity-50"
                                    >
                                      <Send size={12} /> Relancer
                                    </button>
                                    <button type="button" onClick={() => void advanceCase(c.id)} className="text-xs text-indigo-600 hover:underline shrink-0">Étape suivante</button>
                                  </>
                                )}
                              </RowShareActionBar>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'risk' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3 text-right">Score</th>
                        <th className="px-4 py-3">Risque</th>
                        <th className="px-4 py-3 text-right">Encours</th>
                        <th className="px-4 py-3 text-right">Impayés</th>
                        <th className="px-4 py-3 text-right">Retard max</th>
                        <th className="px-4 py-3">Contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskProfiles.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Aucun profil — synchronisez les impayés</td></tr>
                      )}
                      {riskProfiles.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700">{r.clientName}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{r.riskScore}/100</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${RISK_COLORS[r.riskBand]}`}>
                              {RISK_BAND_LABELS[r.riskBand]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMad(r.totalOutstanding)}</td>
                          <td className="px-4 py-3 text-right">{r.overdueCount}</td>
                          <td className="px-4 py-3 text-right">{r.maxDaysOverdue} j</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {r.clientEmail && <span className="block truncate max-w-[140px]">{r.clientEmail}</span>}
                            {r.clientPhone && <span className="block">{r.clientPhone}</span>}
                            {!r.clientEmail && !r.clientPhone && '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'followups' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Canal</th>
                        <th className="px-4 py-3">Étape</th>
                        <th className="px-4 py-3">Destinataire</th>
                        <th className="px-4 py-3">Message</th>
                        <th className="px-4 py-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followUps.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Aucune relance enregistrée</td></tr>
                      )}
                      {followUps.map((f) => (
                        <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(f.sentAt).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-3 text-xs">{CHANNEL_LABELS[f.channel] ?? f.channel}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[f.stage] ?? 'bg-gray-100'}`}>
                              {STAGE_LABELS[f.stage]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{f.recipient ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{f.message}</td>
                          <td className="px-4 py-3 text-xs capitalize">{f.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
