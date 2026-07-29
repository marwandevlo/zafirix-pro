'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Wallet } from 'lucide-react';
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

type Entry = {
  id: string;
  entryType: string;
  amount: number;
  beneficiary: string | null;
  purpose: string | null;
  status: string;
  entryDate: string;
};

const TYPE_LABELS: Record<string, string> = {
  advance: 'Avance',
  expense: 'Dépense',
  replenishment: 'Réapprovisionnement',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  reimbursed: 'Remboursé',
};

export default function CaissePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entryType: 'expense', amount: '', beneficiary: '', purpose: '' });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{ entries?: Entry[]; balance?: number }>(
      `/api/petty-cash?companyId=${encodeURIComponent(cid)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
      setEntries([]);
      setBalance(0);
    } else {
      setEntries(result.data.entries ?? []);
      setBalance(result.data.balance ?? 0);
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

  const createEntry = async () => {
    if (!companyId || !form.amount) return;
    await fetch('/api/petty-cash', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, entryType: form.entryType, amount: Number(form.amount), beneficiary: form.beneficiary, purpose: form.purpose }),
    });
    setShowForm(false);
    setForm({ entryType: 'expense', amount: '', beneficiary: '', purpose: '' });
    await load(companyId);
  };

  const approveEntry = async (id: string) => {
    if (!companyId) return;
    await fetch('/api/petty-cash', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'approved', approvedBy: 'Gestionnaire' }),
    });
    await load(companyId);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Caisse &amp; avances</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Petty cash et notes de frais internes</p>
            </div>
            <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B2A4A] text-white">
              <Plus size={14} /> Nouvelle écriture
            </button>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

          {!companyId && !loading && (
            <ModuleNoCompanyState moduleLabel="la caisse" />
          )}

          <div className="bg-gradient-to-br from-[#1B2A4A] to-[#0F1F3D] rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-2"><Wallet size={20} /><span className="text-sm opacity-80">Solde caisse</span></div>
            <p className="text-3xl font-bold">{balance.toLocaleString('fr-MA')} MAD</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Bénéficiaire</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Aucune écriture</td></tr>
                  )}
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50">
                      <td className="px-4 py-3 text-gray-500">{e.entryDate}</td>
                      <td className="px-4 py-3">{TYPE_LABELS[e.entryType] ?? e.entryType}</td>
                      <td className="px-4 py-3 text-gray-600">{e.beneficiary ?? '—'}</td>
                      <td className={`px-4 py-3 text-right font-medium ${e.entryType === 'replenishment' ? 'text-green-600' : 'text-red-600'}`}>
                        {e.entryType === 'replenishment' ? '+' : '-'}{e.amount.toLocaleString('fr-MA')} MAD
                      </td>
                      <td className="px-4 py-3 text-xs">{STATUS_LABELS[e.status] ?? e.status}</td>
                      <td className="px-4 py-3">
                        <RowShareActionBar
                          entityLabel={`Caisse — ${TYPE_LABELS[e.entryType] ?? e.entryType}`}
                          whatsAppMessage={`Écriture caisse Zafirix Pro\n${TYPE_LABELS[e.entryType]} — ${e.amount.toLocaleString('fr-MA')} MAD\n${e.beneficiary ?? ''}\n${e.purpose ?? ''}`}
                          mailto={{
                            subject: `Validation caisse — ${e.amount.toLocaleString('fr-MA')} MAD`,
                            body: `Demande de validation:\nType: ${TYPE_LABELS[e.entryType]}\nMontant: ${e.amount.toLocaleString('fr-MA')} MAD\nBénéficiaire: ${e.beneficiary ?? '—'}\nObjet: ${e.purpose ?? '—'}`,
                          }}
                        >
                          {e.status === 'pending' && (
                            <button type="button" onClick={() => void approveEntry(e.id)} className="text-xs text-emerald-600 hover:underline shrink-0">Approuver</button>
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

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3">
              <h3 className="font-semibold text-gray-800">Nouvelle écriture caisse</h3>
              <select value={form.entryType} onChange={(e) => setForm({ ...form, entryType: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="expense">Dépense</option>
                <option value="advance">Avance</option>
                <option value="replenishment">Réapprovisionnement</option>
              </select>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Montant (MAD)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={form.beneficiary} onChange={(e) => setForm({ ...form, beneficiary: e.target.value })} placeholder="Bénéficiaire" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Objet / motif" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" onClick={() => void createEntry()} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">Enregistrer</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
