'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { RowShareActionBar } from '@/app/components/share';
import { openWhatsAppShare } from '@/app/lib/atlas-quick-share';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';

type DebtCase = {
  id: string;
  clientName: string;
  amountDue: number;
  stage: string;
  stageLabel: string;
  lastContactAt: string | null;
  nextActionAt: string | null;
  notes: string | null;
};

const STAGE_COLORS: Record<string, string> = {
  reminder_1: 'bg-amber-100 text-amber-800',
  reminder_2: 'bg-orange-100 text-orange-800',
  formal_notice: 'bg-red-100 text-red-800',
  legal: 'bg-purple-100 text-purple-800',
  closed: 'bg-gray-100 text-gray-600',
  paid: 'bg-green-100 text-green-800',
};

export default function RecouvrementPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [cases, setCases] = useState<DebtCase[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{ cases?: DebtCase[]; totalDue?: number }>(
      `/api/debt-collection?companyId=${encodeURIComponent(cid)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
      setCases([]);
      setTotalDue(0);
    } else {
      setCases(result.data.cases ?? []);
      setTotalDue(result.data.totalDue ?? 0);
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

  const sendReminder = (c: DebtCase, channel: 'whatsapp' | 'email') => {
    const msg = `Bonjour ${c.clientName},\n\nNous vous rappelons le règlement de ${c.amountDue.toLocaleString('fr-MA')} MAD (${c.stageLabel}).\n\nMerci de votre collaboration.`;
    if (channel === 'whatsapp') {
      openWhatsAppShare(msg);
    } else {
      void fetch('/api/notifications/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          category: 'debt_collection',
          title: `Relance — ${c.clientName}`,
          body: msg,
          companyId,
          entityType: 'debt_case',
          entityId: c.id,
        }),
      });
    }
  };

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
              <p className="text-sm text-gray-500 mt-1">Workflow intelligent pour factures impayées</p>
            </div>
            <button type="button" disabled={syncing} onClick={() => void syncOverdue()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Importer impayés
            </button>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

          {!companyId && !loading && (
            <ModuleNoCompanyState moduleLabel="le recouvrement" />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Dossiers actifs</p>
              <p className="text-2xl font-bold">{cases.filter((c) => c.stage !== 'paid' && c.stage !== 'closed').length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Montant total dû</p>
              <p className="text-2xl font-bold text-red-600">{totalDue.toLocaleString('fr-MA')} MAD</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3 text-right">Montant dû</th>
                    <th className="px-4 py-3">Étape</th>
                    <th className="px-4 py-3">Prochaine action</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {cases.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Aucun dossier — importez les factures en retard</td></tr>
                  )}
                  {cases.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-700">{c.clientName}</td>
                      <td className="px-4 py-3 text-right font-semibold">{c.amountDue.toLocaleString('fr-MA')} MAD</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[c.stage] ?? 'bg-gray-100'}`}>{c.stageLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.nextActionAt ? new Date(c.nextActionAt).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <RowShareActionBar
                          entityLabel={`Recouvrement ${c.clientName}`}
                          whatsAppMessage={`Relance ${c.clientName} — ${c.amountDue.toLocaleString('fr-MA')} MAD (${c.stageLabel})`}
                          onSendEmail={() => sendReminder(c, 'email')}
                          mailto={{
                            subject: `Relance — ${c.clientName}`,
                            body: `Bonjour ${c.clientName},\n\nNous vous rappelons le règlement de ${c.amountDue.toLocaleString('fr-MA')} MAD (${c.stageLabel}).\n\nMerci de votre collaboration.`,
                          }}
                        >
                          {c.stage !== 'paid' && c.stage !== 'closed' && (
                            <button type="button" onClick={() => void advanceCase(c.id)} className="text-xs text-indigo-600 hover:underline shrink-0">Étape suivante</button>
                          )}
                        </RowShareActionBar>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
