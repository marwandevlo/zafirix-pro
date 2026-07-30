'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Scale,
  Send,
  Wallet,
  XCircle,
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
import type {
  AtlasPettyCashEntry,
  AtlasPettyCashFund,
  AtlasPettyCashReconciliation,
  AtlasPettyCashVoucher,
} from '@/app/types/atlas-enterprise-modules';

type Tab = 'funds' | 'vouchers' | 'ledger' | 'reconcile';

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
  draft: 'Brouillon',
  posted: 'Comptabilisé',
  reconciled: 'Rapproché',
};

const EXPENSE_CATS: Record<string, string> = {
  charges_diverses: 'Charges diverses',
  fournitures: 'Fournitures',
  deplacement: 'Déplacements',
  reception: 'Réception',
  entretien: 'Entretien',
  telecom: 'Télécom',
};

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

export default function CaissePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('funds');
  const [funds, setFunds] = useState<AtlasPettyCashFund[]>([]);
  const [entries, setEntries] = useState<AtlasPettyCashEntry[]>([]);
  const [vouchers, setVouchers] = useState<AtlasPettyCashVoucher[]>([]);
  const [balance, setBalance] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [reconciliation, setReconciliation] = useState<AtlasPettyCashReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showFundForm, setShowFundForm] = useState(false);
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);

  const [fundForm, setFundForm] = useState({ name: '', code: '', floatAmount: '5000', custodianName: '', accountingAccount: '516100' });
  const [voucherForm, setVoucherForm] = useState({
    fundId: '', amount: '', beneficiary: '', purpose: '', expenseCategory: 'charges_diverses', receiptUrl: '', receiptName: '',
  });
  const [entryForm, setEntryForm] = useState({ fundId: '', entryType: 'expense', amount: '', beneficiary: '', purpose: '' });

  const loadDashboard = useCallback(async (cid: string) => {
    const result = await fetchEnterpriseModule<{
      funds?: AtlasPettyCashFund[];
      entries?: AtlasPettyCashEntry[];
      balance?: number;
      pendingTotal?: number;
    }>(`/api/petty-cash?companyId=${encodeURIComponent(cid)}`);
    if (!result.ok) throw new Error(result.error);
    setFunds(result.data.funds ?? []);
    setEntries(result.data.entries ?? []);
    setBalance(result.data.balance ?? 0);
    setPendingTotal(result.data.pendingTotal ?? 0);
    if (result.warning) setLoadError(result.warning);
  }, []);

  const loadVouchers = useCallback(async (cid: string) => {
    const result = await fetchEnterpriseModule<{ vouchers?: AtlasPettyCashVoucher[] }>(
      `/api/petty-cash?companyId=${encodeURIComponent(cid)}&view=vouchers`,
    );
    if (!result.ok) throw new Error(result.error);
    setVouchers(result.data.vouchers ?? []);
  }, []);

  const load = useCallback(async (cid: string, activeTab: Tab = tab) => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadDashboard(cid);
      if (activeTab === 'vouchers') await loadVouchers(cid);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement');
      setFunds([]);
      setEntries([]);
      setVouchers([]);
      setBalance(0);
    }
    setLoading(false);
  }, [tab, loadDashboard, loadVouchers]);

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

  useEffect(() => {
    if (!companyId || tab !== 'vouchers') return;
    void loadVouchers(companyId);
  }, [tab, companyId, loadVouchers]);

  const postApi = async (method: 'POST' | 'PATCH', payload: Record<string, unknown>) => {
    if (!companyId) return;
    const res = await fetch('/api/petty-cash', {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...payload }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!json.ok) throw new Error(json.error ?? 'action_failed');
    await load(companyId, tab);
  };

  const createFund = async () => {
    if (!fundForm.name) return;
    await postApi('POST', {
      action: 'create_fund',
      name: fundForm.name,
      code: fundForm.code,
      floatAmount: Number(fundForm.floatAmount),
      custodianName: fundForm.custodianName,
      accountingAccount: fundForm.accountingAccount,
    });
    setShowFundForm(false);
    setFundForm({ name: '', code: '', floatAmount: '5000', custodianName: '', accountingAccount: '516100' });
  };

  const createVoucher = async () => {
    if (!voucherForm.fundId || !voucherForm.amount) return;
    const attachments = voucherForm.receiptUrl
      ? [{ fileName: voucherForm.receiptName || 'justificatif', fileUrl: voucherForm.receiptUrl }]
      : undefined;
    await postApi('POST', {
      action: 'create_voucher',
      fundId: voucherForm.fundId,
      amount: Number(voucherForm.amount),
      beneficiary: voucherForm.beneficiary,
      purpose: voucherForm.purpose,
      expenseCategory: voucherForm.expenseCategory,
      attachments,
    });
    setShowVoucherForm(false);
    setVoucherForm({ fundId: '', amount: '', beneficiary: '', purpose: '', expenseCategory: 'charges_diverses', receiptUrl: '', receiptName: '' });
    setTab('vouchers');
  };

  const createEntry = async () => {
    if (!entryForm.amount) return;
    await postApi('POST', {
      entryType: entryForm.entryType,
      fundId: entryForm.fundId || undefined,
      amount: Number(entryForm.amount),
      beneficiary: entryForm.beneficiary,
      purpose: entryForm.purpose,
    });
    setShowEntryForm(false);
    setEntryForm({ fundId: '', entryType: 'expense', amount: '', beneficiary: '', purpose: '' });
  };

  const submitVoucher = async (id: string) => {
    await postApi('POST', { action: 'submit_voucher', voucherId: id, actorName: 'Demandeur' });
  };

  const approveVoucher = async (id: string) => {
    await postApi('PATCH', { action: 'approve', voucherId: id, actorName: 'Gestionnaire' });
  };

  const rejectVoucher = async (id: string) => {
    await postApi('PATCH', { action: 'reject', voucherId: id, actorName: 'Gestionnaire' });
  };

  const approveEntry = async (id: string) => {
    await postApi('PATCH', { id, status: 'approved', approvedBy: 'Gestionnaire' });
  };

  const reconcileFund = async (fundId: string) => {
    if (!companyId) return;
    const res = await fetch('/api/petty-cash', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, action: 'reconcile', fundId }),
    });
    const json = (await res.json()) as { ok?: boolean; reconciliation?: AtlasPettyCashReconciliation };
    if (json.ok && json.reconciliation) setReconciliation(json.reconciliation);
    await load(companyId, tab);
  };

  const replenishFund = async (fundId: string) => {
    const amt = window.prompt('Montant de réapprovisionnement (MAD) :', '1000');
    if (!amt) return;
    await postApi('POST', { action: 'replenish', fundId, amount: Number(amt) });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'funds', label: 'Fonds de caisse' },
    { id: 'vouchers', label: 'Pièces de dépense' },
    { id: 'ledger', label: 'Journal' },
    { id: 'reconcile', label: 'Rapprochement' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Caisse de régie</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Petty cash, pièces de dépense et rapprochement comptable</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowFundForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <Plus size={14} /> Fonds
              </button>
              <button type="button" onClick={() => setShowVoucherForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <FileText size={14} /> Pièce de dépense
              </button>
              <button type="button" onClick={() => setShowEntryForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B2A4A] text-white">
                <Plus size={14} /> Nouvelle écriture
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="la caisse" />}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-[#1B2A4A] to-[#0F1F3D] rounded-xl p-5 text-white shadow-lg sm:col-span-2">
              <div className="flex items-center gap-2 mb-2"><Wallet size={20} /><span className="text-sm opacity-80">Solde caisse</span></div>
              <p className="text-3xl font-bold">{formatMad(balance)}</p>
              {pendingTotal > 0 && <p className="text-xs opacity-70 mt-1">{formatMad(pendingTotal)} en attente de validation</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Fonds actifs</p>
              <p className="text-2xl font-bold text-gray-800">{funds.filter((f) => f.isActive).length}</p>
              <p className="text-xs text-gray-500 mt-1">{vouchers.filter((v) => v.status === 'pending').length} pièce(s) à valider</p>
            </div>
          </div>

          <div className="flex gap-1 border-b border-gray-200">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === id ? 'border-[#1B2A4A] text-[#1B2A4A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <>
              {tab === 'funds' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {funds.length === 0 && (
                    <p className="text-sm text-gray-400 col-span-2 py-8 text-center">Créez un fonds de caisse pour commencer</p>
                  )}
                  {funds.map((f) => (
                    <div key={f.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-800">{f.name}</h3>
                          <p className="text-xs text-gray-500">{f.code} · Compte {f.accountingAccount}</p>
                          {f.custodianName && <p className="text-xs text-gray-500">Régisseur : {f.custodianName}</p>}
                        </div>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${f.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {f.isActive ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><p className="text-xs text-gray-400">Solde</p><p className="font-bold text-[#1B2A4A]">{formatMad(f.currentBalance ?? 0)}</p></div>
                        <div><p className="text-xs text-gray-400">Plafond</p><p className="font-medium">{formatMad(f.floatAmount)}</p></div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => void replenishFund(f.id)} className="text-xs text-blue-600 hover:underline">Réapprovisionner</button>
                        <button type="button" onClick={() => void reconcileFund(f.id)} className="text-xs text-emerald-600 hover:underline">Rapprocher</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'vouchers' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3">N° pièce</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Fonds</th>
                        <th className="px-4 py-3">Objet</th>
                        <th className="px-4 py-3 text-right">Montant</th>
                        <th className="px-4 py-3">Statut</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {vouchers.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Aucune pièce de dépense</td></tr>
                      )}
                      {vouchers.map((v) => (
                        <tr key={v.id} className="border-b border-gray-50">
                          <td className="px-4 py-3 font-mono text-xs">{v.voucherNumber}</td>
                          <td className="px-4 py-3 text-gray-500">{v.voucherDate}</td>
                          <td className="px-4 py-3 text-gray-600">{v.fundName ?? '—'}</td>
                          <td className="px-4 py-3">
                            <p className="text-gray-800">{v.purpose ?? v.beneficiary ?? '—'}</p>
                            <p className="text-[10px] text-gray-400">{EXPENSE_CATS[v.expenseCategory] ?? v.expenseCategory} · {v.expenseAccount}</p>
                            {v.attachments && v.attachments.length > 0 && (
                              <a href={v.attachments[0].fileUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline">Justificatif</a>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-red-600">-{formatMad(v.amount)}</td>
                          <td className="px-4 py-3 text-xs">{STATUS_LABELS[v.status] ?? v.status}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 justify-end flex-wrap">
                              {v.status === 'draft' && (
                                <button type="button" onClick={() => void submitVoucher(v.id)} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5"><Send size={12} /> Soumettre</button>
                              )}
                              {v.status === 'pending' && (
                                <>
                                  <button type="button" onClick={() => void approveVoucher(v.id)} className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-0.5"><CheckCircle2 size={12} /> Approuver</button>
                                  <button type="button" onClick={() => void rejectVoucher(v.id)} className="text-xs text-red-600 hover:underline inline-flex items-center gap-0.5"><XCircle size={12} /> Rejeter</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'ledger' && (
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
                            {e.entryType === 'replenishment' ? '+' : '-'}{formatMad(e.amount)}
                          </td>
                          <td className="px-4 py-3 text-xs">{STATUS_LABELS[e.status] ?? e.status}</td>
                          <td className="px-4 py-3">
                            <RowShareActionBar
                              entityLabel={`Caisse — ${TYPE_LABELS[e.entryType] ?? e.entryType}`}
                              whatsAppMessage={`Écriture caisse Zafirix Pro\n${TYPE_LABELS[e.entryType]} — ${formatMad(e.amount)}\n${e.beneficiary ?? ''}\n${e.purpose ?? ''}`}
                              mailto={{
                                subject: `Validation caisse — ${formatMad(e.amount)}`,
                                body: `Type: ${TYPE_LABELS[e.entryType]}\nMontant: ${formatMad(e.amount)}\nBénéficiaire: ${e.beneficiary ?? '—'}\nObjet: ${e.purpose ?? '—'}`,
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

              {tab === 'reconcile' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Comparez le solde physique de chaque fonds avec le compte comptable (PCG marocain, ex. 516100 Caisse).</p>
                  {funds.map((f) => (
                    <div key={f.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Scale size={16} /> {f.name}</h3>
                        <p className="text-sm text-gray-500">Compte {f.accountingAccount} · Solde physique : {formatMad(f.currentBalance ?? 0)}</p>
                      </div>
                      <button type="button" onClick={() => void reconcileFund(f.id)} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg hover:bg-[#0F1F3D]">
                        Lancer le rapprochement
                      </button>
                    </div>
                  ))}
                  {reconciliation && (
                    <div className={`rounded-xl border p-5 ${reconciliation.isBalanced ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                      <h3 className="font-semibold text-gray-800 mb-3">Résultat — {reconciliation.fundName}</h3>
                      <div className="grid sm:grid-cols-3 gap-4 text-sm">
                        <div><p className="text-xs text-gray-500">Solde caisse</p><p className="font-bold">{formatMad(reconciliation.physicalBalance)}</p></div>
                        <div><p className="text-xs text-gray-500">Solde comptable ({reconciliation.accountingAccount})</p><p className="font-bold">{formatMad(reconciliation.accountingBalance)}</p></div>
                        <div><p className="text-xs text-gray-500">Écart</p><p className={`font-bold ${reconciliation.isBalanced ? 'text-green-700' : 'text-amber-700'}`}>{formatMad(reconciliation.variance)}</p></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-3">Rapproché le {reconciliation.reconciledAt.slice(0, 16).replace('T', ' ')}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {showFundForm && (
          <Modal title="Nouveau fonds de caisse" onClose={() => setShowFundForm(false)} onSubmit={() => void createFund()}>
            <input value={fundForm.name} onChange={(e) => setFundForm({ ...fundForm, name: e.target.value })} placeholder="Nom (ex: Caisse siège)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={fundForm.code} onChange={(e) => setFundForm({ ...fundForm, code: e.target.value })} placeholder="Code" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={fundForm.custodianName} onChange={(e) => setFundForm({ ...fundForm, custodianName: e.target.value })} placeholder="Régisseur" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={fundForm.floatAmount} onChange={(e) => setFundForm({ ...fundForm, floatAmount: e.target.value })} placeholder="Plafond / dotation (MAD)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={fundForm.accountingAccount} onChange={(e) => setFundForm({ ...fundForm, accountingAccount: e.target.value })} placeholder="Compte PCG (516100)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </Modal>
        )}

        {showVoucherForm && (
          <Modal title="Pièce de dépense" onClose={() => setShowVoucherForm(false)} onSubmit={() => void createVoucher()} submitLabel="Créer">
            <select value={voucherForm.fundId} onChange={(e) => setVoucherForm({ ...voucherForm, fundId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Fonds de caisse</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <input type="number" value={voucherForm.amount} onChange={(e) => setVoucherForm({ ...voucherForm, amount: e.target.value })} placeholder="Montant (MAD)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <select value={voucherForm.expenseCategory} onChange={(e) => setVoucherForm({ ...voucherForm, expenseCategory: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {Object.entries(EXPENSE_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={voucherForm.beneficiary} onChange={(e) => setVoucherForm({ ...voucherForm, beneficiary: e.target.value })} placeholder="Bénéficiaire" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={voucherForm.purpose} onChange={(e) => setVoucherForm({ ...voucherForm, purpose: e.target.value })} placeholder="Objet / motif" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={voucherForm.receiptUrl} onChange={(e) => setVoucherForm({ ...voucherForm, receiptUrl: e.target.value })} placeholder="URL justificatif (reçu scanné)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={voucherForm.receiptName} onChange={(e) => setVoucherForm({ ...voucherForm, receiptName: e.target.value })} placeholder="Nom du fichier justificatif" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </Modal>
        )}

        {showEntryForm && (
          <Modal title="Nouvelle écriture caisse" onClose={() => setShowEntryForm(false)} onSubmit={() => void createEntry()}>
            <select value={entryForm.fundId} onChange={(e) => setEntryForm({ ...entryForm, fundId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Fonds (optionnel)</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select value={entryForm.entryType} onChange={(e) => setEntryForm({ ...entryForm, entryType: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="expense">Dépense</option>
              <option value="advance">Avance</option>
              <option value="replenishment">Réapprovisionnement</option>
            </select>
            <input type="number" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} placeholder="Montant (MAD)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={entryForm.beneficiary} onChange={(e) => setEntryForm({ ...entryForm, beneficiary: e.target.value })} placeholder="Bénéficiaire" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={entryForm.purpose} onChange={(e) => setEntryForm({ ...entryForm, purpose: e.target.value })} placeholder="Objet / motif" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </Modal>
        )}
      </main>
    </div>
  );
}

function Modal({ title, children, onClose, onSubmit, submitLabel = 'Créer' }: { title: string; children: ReactNode; onClose: () => void; onSubmit: () => void; submitLabel?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3">
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
