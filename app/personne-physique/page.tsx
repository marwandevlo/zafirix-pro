'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calculator,
  MinusCircle,
  Plus,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { ModuleAppShell } from '@/app/components/shell/ModuleAppShell';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type {
  PpDashboardPayload,
  PpLedgerEntryType,
  PpTaxRegime,
} from '@/app/types/atlas-individual-tax';
import {
  PP_EXPENSE_CATEGORIES,
  PP_REGIME_LABELS,
  PP_REVENUE_CATEGORIES,
} from '@/app/types/atlas-individual-tax';

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border bg-white" />
        ))}
      </div>
      <div className="h-72 rounded-xl border bg-white" />
    </div>
  );
}

export default function PersonnePhysiquePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [data, setData] = useState<PpDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(() => new Date().getFullYear());
  const genRef = useRef(0);

  const [form, setForm] = useState({
    entryType: 'revenue' as PpLedgerEntryType,
    entryDate: new Date().toISOString().slice(0, 10),
    amountMad: '',
    category: 'honoraires',
    label: '',
    deductible: true,
    documentRef: '',
  });

  const load = useCallback(async (cid: string, year: number) => {
    const gen = ++genRef.current;
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<PpDashboardPayload & { warning?: string }>(
      `/api/personne-physique?companyId=${encodeURIComponent(cid)}&fiscalYear=${year}`,
    );
    if (gen !== genRef.current) return;
    if (!result.ok) {
      setLoadError(result.error);
      setData(null);
    } else {
      setData(result.data);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      if (cancelled) return;
      setCompanyId(cid);
      if (cid) await load(cid, fiscalYear);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => {
      setCompanyId(cid);
      if (cid) void load(cid, fiscalYear);
      else {
        setData(null);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      off();
      genRef.current += 1;
    };
  }, [load, fiscalYear]);

  const post = async (payload: Record<string, unknown>) => {
    if (!companyId) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch('/api/personne-physique', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, fiscalYear, ...payload }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || json.ok === false) {
        setActionError(json.message ?? json.error ?? 'Action impossible');
        return;
      }
      await load(companyId, fiscalYear);
    } catch {
      setActionError('Connexion impossible. Réessayez.');
    } finally {
      setMutating(false);
    }
  };

  const setRegime = async (taxRegime: PpTaxRegime) => {
    await post({ action: 'update_profile', taxRegime });
  };

  const addEntry = async () => {
    const amount = Number(form.amountMad);
    if (!Number.isFinite(amount) || amount < 0) {
      setActionError('Saisissez un montant valide.');
      return;
    }
    await post({
      action: 'add_entry',
      entryType: form.entryType,
      entryDate: form.entryDate,
      amountMad: amount,
      category: form.category,
      label: form.label,
      deductible: form.deductible,
      documentRef: form.documentRef,
    });
    setShowForm(false);
    setForm({
      entryType: 'revenue',
      entryDate: new Date().toISOString().slice(0, 10),
      amountMad: '',
      category: 'honoraires',
      label: '',
      deductible: true,
      documentRef: '',
    });
  };

  const categoryOptions =
    form.entryType === 'revenue' ? PP_REVENUE_CATEGORIES : PP_EXPENSE_CATEGORIES;

  return (
    <ModuleAppShell
      title="Personne physique"
      subtitle="Comptabilité professionnelle, charges déductibles, bénéfice net et estimation IR"
      headerActions={
        <>
          <BetaSurfaceBadge className="hidden md:block" label="Bêta · RNR / RNS" />
          <select
            value={fiscalYear}
            onChange={(e) => setFiscalYear(Number(e.target.value))}
            className="border rounded-xl px-3 py-2 text-sm bg-white min-h-11"
          >
            {[0, 1, 2].map((o) => {
              const y = new Date().getFullYear() - o;
              return (
                <option key={y} value={y}>
                  Exercice {y}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            disabled={!companyId || loading || mutating}
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium rounded-xl bg-[#1B2A4A] text-white disabled:opacity-50"
          >
            <Plus size={14} /> Produit / charge
          </button>
        </>
      }
    >
      <div className="space-y-6">
          <BetaSurfaceBadge className="md:hidden" label="Bêta · RNR / RNS" />
          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          <ModuleLoadErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="la comptabilité personne physique" />}

          {loading ? (
            <Skeleton />
          ) : data ? (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500 flex items-center gap-1 w-full sm:w-auto"><Scale size={12} /> Régime fiscal :</span>
                {(Object.keys(PP_REGIME_LABELS) as PpTaxRegime[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={mutating}
                    onClick={() => void setRegime(key)}
                    className={`text-xs min-h-10 px-3 py-2 rounded-full border transition-colors ${
                      data.regime === key
                        ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {PP_REGIME_LABELS[key]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><TrendingUp size={12} /> Chiffre d’affaires</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatMad(data.chiffreAffairesMad)}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{data.revenueCount} produit(s)</p>
                </div>
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><MinusCircle size={12} /> Charges déductibles</p>
                  <p className="text-xl sm:text-2xl font-bold text-amber-700 mt-1">{formatMad(data.chargesDeductiblesMad)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Wallet size={12} /> Bénéfice net</p>
                  <p className={`text-xl sm:text-2xl font-bold mt-1 ${data.beneficeNetImposableMad >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatMad(data.beneficeNetImposableMad)}
                  </p>
                </div>
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Calculator size={12} /> IR indicatif</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatMad(data.indicativeIrMad)}</p>
                  <p className="text-[11px] text-gray-500 mt-1">~ {data.indicativeEffectiveRatePct.toFixed(1)} %</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-800">Journal {fiscalYear}</h2>
                  <p className="text-[11px] text-gray-400">{data.entries.length} écriture(s)</p>
                </div>
                <div className="md:hidden divide-y">
                  {data.entries.length === 0 ? (
                    <p className="px-4 py-12 text-center text-gray-400 text-sm">Aucune écriture</p>
                  ) : (
                    data.entries.map((e) => (
                      <div key={e.id} className="px-4 py-3">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 truncate">{e.label || '—'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {e.entryDate} · {(e.entryType === 'revenue' ? PP_REVENUE_CATEGORIES : PP_EXPENSE_CATEGORIES)[e.category] ?? e.category}
                            </p>
                          </div>
                          <p className={`font-semibold shrink-0 ${e.entryType === 'revenue' ? 'text-emerald-700' : 'text-amber-800'}`}>
                            {e.entryType === 'revenue' ? '+' : '−'}{formatMad(e.amountMad)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="hidden md:block overflow-x-auto mobile-scroll-x">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b">
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Catégorie</th>
                        <th className="px-4 py-2">Libellé</th>
                        <th className="px-4 py-2 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                            Aucune écriture — saisissez un produit ou une charge déductible
                          </td>
                        </tr>
                      )}
                      {data.entries.map((e) => (
                        <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{e.entryDate}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                e.entryType === 'revenue'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {e.entryType === 'revenue' ? 'Produit' : e.deductible ? 'Charge déductible' : 'Charge non déductible'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {(e.entryType === 'revenue' ? PP_REVENUE_CATEGORIES : PP_EXPENSE_CATEGORIES)[e.category] ?? e.category}
                          </td>
                          <td className="px-4 py-2 text-gray-800">
                            <p className="truncate max-w-[220px]">{e.label || '—'}</p>
                            {e.documentRef && <p className="text-[10px] text-gray-400">{e.documentRef}</p>}
                          </td>
                          <td className={`px-4 py-2 text-right font-medium ${e.entryType === 'revenue' ? 'text-emerald-700' : 'text-amber-800'}`}>
                            {e.entryType === 'revenue' ? '+' : '−'}{formatMad(e.amountMad)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
      </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <h3 className="font-semibold text-gray-800">Nouvelle écriture</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, entryType: 'revenue', category: 'honoraires' })}
                  className={`flex-1 text-xs min-h-11 py-2 rounded-xl border ${form.entryType === 'revenue' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white'}`}
                >
                  Produit (CA)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, entryType: 'expense', category: 'divers' })}
                  className={`flex-1 text-xs min-h-11 py-2 rounded-xl border ${form.entryType === 'expense' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white'}`}
                >
                  Charge
                </button>
              </div>
              <input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={form.amountMad} onChange={(e) => setForm({ ...form, amountMad: e.target.value })} placeholder="Montant (MAD) *" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" inputMode="decimal" />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded-xl px-3 py-3 text-sm min-h-11"
              >
                {Object.entries(categoryOptions).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Libellé" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={form.documentRef} onChange={(e) => setForm({ ...form, documentRef: e.target.value })} placeholder="Réf. pièce (optionnel)" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              {form.entryType === 'expense' && (
                <label className="flex items-center gap-2 text-xs text-gray-600 min-h-11">
                  <input
                    type="checkbox"
                    checked={form.deductible}
                    onChange={(e) => setForm({ ...form, deductible: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Charge déductible fiscalement
                </label>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={mutating} onClick={() => setShowForm(false)} className="min-h-11 px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" disabled={mutating} onClick={() => void addEntry()} className="min-h-11 px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-xl disabled:opacity-50">
                  {mutating ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
    </ModuleAppShell>
  );
}
