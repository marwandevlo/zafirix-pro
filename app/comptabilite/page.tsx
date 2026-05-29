'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import type { AtlasInvoice } from '@/app/types/atlas-invoice';
import { listSupplierInvoices } from '@/app/lib/atlas-supplier-invoices-repository';
import type { AtlasSupplierInvoice } from '@/app/types/atlas-supplier-invoice';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isOverdue, todayYmd } from '@/app/lib/atlas-dates';
import { listAtlasPayments } from '@/app/lib/atlas-payments-repository';
import type { AtlasPayment } from '@/app/types/atlas-payment';
import { fetchAi } from '@/app/lib/fetch-ai';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';
import {
  listAtlasAccountingEntries,
  upsertAtlasAccountingEntry,
} from '@/app/lib/atlas-accounting-repository';
import { refreshAtlasUsageState } from '@/app/lib/atlas-usage-limits';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import type { AtlasAccountingEntry } from '@/app/types/atlas-accounting';

type Ecriture = AtlasAccountingEntry;

export default function ComptabilitePage() {
  const [activeTab, setActiveTab] = useState<'journal' | 'grandlivre' | 'bilan'>('journal');
  const [invoices, setInvoices] = useState<AtlasInvoice[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<AtlasSupplierInvoice[]>([]);
  const [payments, setPayments] = useState<AtlasPayment[]>([]);
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);

  const [form, setForm] = useState({ date: '', libelle: '', compte: '', debit: '', credit: '' });
  const [showForm, setShowForm] = useState(false);
  const [insight, setInsight] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });

  const reloadAccountingData = useCallback(async () => {
    if (isAtlasSupabaseDataEnabled()) {
      await refreshAtlasUsageState();
    }
    setInvoices(await listAtlasInvoices());
    setPayments(await listAtlasPayments());
    setEcritures(await listAtlasAccountingEntries());
    const companyId = await getActiveCompanyDbRowId();
    setActiveCompanyId(companyId);
    if (companyId) {
      setSupplierInvoices(await listSupplierInvoices(companyId));
    } else {
      setSupplierInvoices([]);
    }
  }, []);

  useEffect(() => {
    void reloadAccountingData();
  }, [reloadAccountingData]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void reloadAccountingData();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadAccountingData]);

  const totalDebit = ecritures.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);

  const accountingKpis = useMemo(() => {
    const totalFacture = invoices.reduce((sum, inv) => sum + (inv.totalTTC || 0), 0);

    const paymentsByInvoice = new Map<string, number>();
    for (const p of payments) {
      const key = String(p.invoiceId);
      paymentsByInvoice.set(key, (paymentsByInvoice.get(key) ?? 0) + (p.paidAmount || 0));
    }

    const paidForInvoice = (inv: AtlasInvoice): number => {
      const key = String(inv.id);
      const sum = paymentsByInvoice.get(key) ?? 0;
      return sum > 0 ? sum : (inv.paidAmount ?? 0);
    };

    const totalPaye = invoices.reduce((sum, inv) => sum + paidForInvoice(inv), 0);
    const resteAPayer = invoices.reduce((sum, inv) => sum + Math.max(0, (inv.totalTTC || 0) - paidForInvoice(inv)), 0);

    const balanceClient = resteAPayer;
    const balanceFournisseur = supplierInvoices
      .filter((inv) => inv.status === 'unpaid' || inv.status === 'needs_review')
      .reduce((sum, inv) => sum + (inv.totalTTC ?? 0), 0);
    const soldeGlobal = balanceClient - balanceFournisseur;

    const now = todayYmd();
    const overdue = invoices
      .filter((inv) => {
        const remaining = Math.max(0, (inv.totalTTC || 0) - paidForInvoice(inv));
        return remaining > 0 && isOverdue(inv.dueDate, false, now);
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    return {
      balanceClient,
      balanceFournisseur,
      totalFacture,
      totalPaye,
      resteAPayer,
      soldeGlobal,
      overdue,
    };
  }, [invoices, payments, supplierInvoices]);

  useEffect(() => {
    if (accountingKpis.overdue.length === 0) {
      queueMicrotask(() => setInsight({ loading: false, text: '' }));
      return;
    }
    let cancelled = false;
    const run = async () => {
      setInsight({ loading: true, text: '' });
      const top = accountingKpis.overdue.slice(0, 5).map((inv) => `- ${inv.number} (${inv.clientName}) · échéance ${inv.dueDate} · TTC ${formatMadAmountLabel(inv.totalTTC || 0)}`).join('\n');
      const fallback =
        `Factures en retard: ${accountingKpis.overdue.length}.\n` +
        `Recommandation: relance rapide (mail + appel), puis proposition d’échéancier, et suivi hebdomadaire.\n\n` +
        `Top:\n${top}`;

      try {
        const res = await fetchAi({
          type: 'consultant',
          systemPrompt: 'Tu es un assistant comptable. Réponds en français, concis, orienté action. Pas de tableaux.',
          message:
            `Résume les factures en retard et propose une action simple.\n` +
            `Factures (top):\n${top}\n\n` +
            `Format:\n1) Résumé (1 phrase)\n2) Recommandation (2 bullets)\n3) Prochaine action (1 phrase)`,
        });
        const raw: unknown = await res.json().catch(() => ({}));
        const responseText =
          typeof raw === 'object' &&
          raw !== null &&
          'response' in raw &&
          typeof (raw as { response: unknown }).response === 'string'
            ? String((raw as { response: string }).response).trim()
            : '';
        const text = responseText || fallback;
        if (!cancelled) setInsight({ loading: false, text });
      } catch {
        if (!cancelled) setInsight({ loading: false, text: fallback });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [accountingKpis.overdue]);

  const addEcriture = async () => {
    if (!form.libelle || !form.compte) return;
    const entry: Ecriture = {
      id: Date.now(),
      date: form.date || new Date().toISOString().split('T')[0],
      libelle: form.libelle,
      compte: form.compte,
      debit: parseFloat(form.debit) || 0,
      credit: parseFloat(form.credit) || 0,
    };
    const result = await upsertAtlasAccountingEntry(entry, { companyId: activeCompanyId });
    if (result.ok) {
      await reloadAccountingData();
    }
    setForm({ date: '', libelle: '', compte: '', debit: '', credit: '' });
    setShowForm(false);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module">
        {(['journal', 'grandlivre', 'bilan'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${activeTab === tab ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
          >
            <BookOpen size={16} />
            {tab === 'journal' ? 'Journal' : tab === 'grandlivre' ? 'Grand-livre' : 'Bilan'}
          </button>
        ))}
      </AppSidebar>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Comptabilite</h1>
            <p className="text-xs text-gray-400 mt-0.5">KPIs factures · journal enregistré</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors">
            <Plus size={16} /> Nouvelle ecriture
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Balance client</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{formatMadAmountLabel(accountingKpis.balanceClient)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Balance fournisseur</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{formatMadAmountLabel(accountingKpis.balanceFournisseur)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Solde global</p>
              <p className={`text-2xl font-bold mt-1 ${accountingKpis.soldeGlobal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatMadAmountLabel(accountingKpis.soldeGlobal)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total facturé</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{formatMadAmountLabel(accountingKpis.totalFacture)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total payé</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatMadAmountLabel(accountingKpis.totalPaye)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Reste à payer</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatMadAmountLabel(accountingKpis.resteAPayer)}</p>
            </div>
          </div>

          {supplierInvoices.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">Factures fournisseur (OCR)</h2>
                <p className="text-xs text-gray-400 mt-0.5">Données enregistrées depuis Documents IA</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3">N°</th>
                    <th className="px-6 py-3">Fournisseur</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Statut</th>
                    <th className="px-6 py-3 text-right">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierInvoices.slice(0, 10).map((inv) => (
                    <tr key={String(inv.id)} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-700">{inv.invoiceNumber || '—'}</td>
                      <td className="px-6 py-3 text-gray-600">{inv.supplierName}</td>
                      <td className="px-6 py-3 text-gray-500">{inv.issueDate}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          inv.status === 'paid'
                            ? 'bg-green-100 text-green-700'
                            : inv.status === 'needs_review'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}>
                          {inv.status === 'needs_review' ? 'À compléter' : inv.status === 'paid' ? 'Payée' : 'À payer'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-800">
                        {inv.totalTTC != null ? formatMadAmountLabel(inv.totalTTC) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {accountingKpis.overdue.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-red-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 text-sm">Alerte paiements · Factures en retard</h2>
                <span className="text-xs text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full font-medium">
                  {accountingKpis.overdue.length} en retard
                </span>
              </div>
              <div className="px-6 py-4 border-b border-red-100 bg-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Insight IA</p>
                    <p className="text-xs text-gray-400">Résumé et recommandation sur les retards</p>
                  </div>
                  {insight.loading && <p className="text-xs text-gray-400">Analyse…</p>}
                </div>
                {insight.text && (
                  <div className="mt-3 rounded-xl border border-red-100 bg-red-50/30 p-4">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap wrap-break-word">{insight.text}</pre>
                  </div>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3">Numéro</th>
                    <th className="px-6 py-3">Client</th>
                    <th className="px-6 py-3">Date émission</th>
                    <th className="px-6 py-3">Date échéance</th>
                    <th className="px-6 py-3 text-right">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {accountingKpis.overdue.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-700">{inv.number}</td>
                      <td className="px-6 py-3 text-gray-600">{inv.clientName}</td>
                      <td className="px-6 py-3 text-gray-500">{inv.issueDate}</td>
                      <td className="px-6 py-3 text-red-700 font-medium">{inv.dueDate}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-800">{formatMadAmountLabel(inv.totalTTC || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total Debit</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatMadAmountLabel(totalDebit)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total Credit</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatMadAmountLabel(totalCredit)}</p>
            </div>
            <div className={`rounded-xl p-5 shadow-sm border ${totalDebit === totalCredit ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-400">Equilibre</p>
              <p className={`text-2xl font-bold mt-1 ${totalDebit === totalCredit ? 'text-green-600' : 'text-red-600'}`}>
                {totalDebit === totalCredit ? 'Equilibre' : 'Desequilibre'}
              </p>
            </div>
          </div>

          {showForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-200">
              <h2 className="font-semibold text-gray-700 mb-4">Nouvelle ecriture comptable</h2>
              <div className="grid grid-cols-3 gap-4">
                <input value={form.date} onChange={e => setForm({...form, date: e.target.value})} type="date" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.libelle} onChange={e => setForm({...form, libelle: e.target.value})} placeholder="Libelle" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.compte} onChange={e => setForm({...form, compte: e.target.value})} placeholder="N Compte" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.debit} onChange={e => setForm({...form, debit: e.target.value})} placeholder="Debit (MAD)" type="number" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.credit} onChange={e => setForm({...form, credit: e.target.value})} placeholder="Credit (MAD)" type="number" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <div className="flex gap-2">
                  <button onClick={addEcriture} className="flex-1 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660]">Ajouter</button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">Annuler</button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex border-b border-gray-100">
              {(['journal', 'grandlivre', 'bilan'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium transition-all ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  {tab === 'journal' ? 'Journal' : tab === 'grandlivre' ? 'Grand-livre' : 'Bilan'}
                </button>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Libelle</th>
                  <th className="px-4 py-3">Compte</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {ecritures.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                      Aucune écriture enregistrée. Ajoutez une ligne pour démarrer le journal.
                    </td>
                  </tr>
                ) : (
                  ecritures.map(e => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{e.date}</td>
                      <td className="px-4 py-3 text-gray-700">{e.libelle}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{e.compte}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{e.debit > 0 ? formatMadAmountLabel(e.debit) : '-'}</td>
                      <td className="px-4 py-3 text-right text-green-600">{e.credit > 0 ? formatMadAmountLabel(e.credit) : '-'}</td>
                    </tr>
                  ))
                )}
                <tr className="bg-gray-50 font-bold text-sm">
                  <td colSpan={3} className="px-4 py-3 text-gray-600">TOTAL</td>
                  <td className="px-4 py-3 text-right text-blue-700">{formatMadAmountLabel(totalDebit)}</td>
                  <td className="px-4 py-3 text-right text-green-700">{formatMadAmountLabel(totalCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}