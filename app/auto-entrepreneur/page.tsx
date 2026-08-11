'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Store,
  TrendingUp,
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
  AeActivityType,
  AeDashboardPayload,
  AeDeclarationStatus,
} from '@/app/types/atlas-individual-tax';
import {
  AE_ACTIVITY_LABELS,
  AE_DECLARATION_STATUS_LABELS,
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
      <div className="h-64 rounded-xl border bg-white" />
    </div>
  );
}

const COMPLIANCE_STYLE: Record<string, string> = {
  conforme: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  attention: 'bg-amber-50 border-amber-200 text-amber-900',
  depassement: 'bg-red-50 border-red-200 text-red-800',
  declarations_en_retard: 'bg-orange-50 border-orange-200 text-orange-900',
};

export default function AutoEntrepreneurPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [data, setData] = useState<AeDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(() => new Date().getFullYear());
  const genRef = useRef(0);

  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    amountMad: '',
    label: '',
    clientName: '',
    invoiceRef: '',
  });

  const load = useCallback(async (cid: string, year: number) => {
    const gen = ++genRef.current;
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<AeDashboardPayload & { warning?: string }>(
      `/api/auto-entrepreneur?companyId=${encodeURIComponent(cid)}&fiscalYear=${year}`,
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
      const res = await fetch('/api/auto-entrepreneur', {
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

  const addTurnover = async () => {
    const amount = Number(form.amountMad);
    if (!Number.isFinite(amount) || amount < 0) {
      setActionError('Saisissez un montant de CA valide.');
      return;
    }
    await post({
      action: 'add_turnover',
      entryDate: form.entryDate,
      amountMad: amount,
      label: form.label,
      clientName: form.clientName,
      invoiceRef: form.invoiceRef,
    });
    setShowForm(false);
    setForm({
      entryDate: new Date().toISOString().slice(0, 10),
      amountMad: '',
      label: '',
      clientName: '',
      invoiceRef: '',
    });
  };

  const updateActivity = async (activityType: AeActivityType) => {
    await post({ action: 'update_profile', activityType });
  };

  const markDecl = async (quarter: number, status: AeDeclarationStatus) => {
    await post({ action: 'mark_declaration', quarter, status });
  };

  const ceilingPct = useMemo(() => Math.min(100, data?.ceilingUsagePct ?? 0), [data?.ceilingUsagePct]);

  return (
    <ModuleAppShell
      title="Auto-entrepreneur"
      subtitle="Suivi du CA trimestriel, plafond légal et déclarations (loi 114-13 / CGI)"
      headerActions={
        <>
          <BetaSurfaceBadge className="hidden md:block" label="Bêta · fiscalité individuelle" />
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
            <Plus size={14} /> Encaissement CA
          </button>
        </>
      }
    >
      <div className="space-y-6">
          <BetaSurfaceBadge className="md:hidden" label="Bêta · fiscalité individuelle" />
          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          <ModuleLoadErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="le suivi auto-entrepreneur" />}

          {loading ? (
            <Skeleton />
          ) : data ? (
            <>
              <div className={`rounded-xl border px-4 py-3 text-sm flex gap-2 ${COMPLIANCE_STYLE[data.complianceStatus] ?? COMPLIANCE_STYLE.conforme}`}>
                {data.complianceStatus === 'conforme' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                <div>
                  <p className="font-semibold">Statut de conformité</p>
                  <p className="opacity-90">{data.complianceLabel}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500 w-full sm:w-auto">Nature d’activité :</span>
                {(Object.keys(AE_ACTIVITY_LABELS) as AeActivityType[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={mutating}
                    onClick={() => void updateActivity(key)}
                    className={`text-xs min-h-10 px-3 py-2 rounded-full border transition-colors ${
                      data.profile?.activityType === key
                        ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {AE_ACTIVITY_LABELS[key]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><TrendingUp size={12} /> CA trimestriel (T{data.currentQuarter})</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatMad(data.currentQuarterCaMad)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4 shadow-sm col-span-2 sm:col-span-1">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Store size={12} /> CA annuel vs plafond</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatMad(data.annualCaMad)}</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Plafond {formatMad(data.annualCeilingMad)} · reste {formatMad(data.remainingCeilingMad)}
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ceilingPct >= 100 ? 'bg-red-500' : ceilingPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${ceilingPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{ceilingPct.toFixed(1)} % du plafond</p>
                </div>
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><FileText size={12} /> Factures / encaissements</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{data.invoiceCount}</p>
                </div>
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Clock size={12} /> Cotisation indicative</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatMad(data.indicativeAnnualTaxMad)}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{data.indicativeTaxRatePct} % du CA (indicatif)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-800">Déclarations trimestrielles {fiscalYear}</h2>
                  </div>
                  <ul className="divide-y">
                    {data.quarters.map((q) => {
                      const st = q.declaration?.status ?? 'pending';
                      return (
                        <li key={q.quarter} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                          <div>
                            <p className="font-medium text-gray-800">{q.label}</p>
                            <p className="text-xs text-gray-500">
                              CA {formatMad(q.caMad)} · {q.invoiceCount} ligne(s) · échéance {q.dueDate}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                              {AE_DECLARATION_STATUS_LABELS[st]}
                            </span>
                            {st === 'pending' && (
                              <button
                                type="button"
                                disabled={mutating}
                                onClick={() => void markDecl(q.quarter, 'declared')}
                                className="min-h-10 px-3 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium disabled:opacity-50"
                              >
                                Marquer déclaré
                              </button>
                            )}
                            {st === 'declared' && (
                              <button
                                type="button"
                                disabled={mutating}
                                onClick={() => void markDecl(q.quarter, 'paid')}
                                className="min-h-10 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium disabled:opacity-50"
                              >
                                Marquer payé
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-800">Derniers encaissements</h2>
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y">
                    {data.entries.length === 0 ? (
                      <p className="px-4 py-10 text-center text-gray-400 text-sm">Aucun encaissement</p>
                    ) : (
                      data.entries.slice(0, 30).map((e) => (
                        <div key={e.id} className="px-4 py-3">
                          <div className="flex justify-between gap-2">
                            <p className="font-medium text-gray-800 truncate">{e.label || 'Encaissement'}</p>
                            <p className="font-semibold shrink-0">{formatMad(e.amountMad)}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{e.entryDate} · T{e.quarter}{e.clientName ? ` · ${e.clientName}` : ''}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="hidden md:block overflow-x-auto max-h-80 mobile-scroll-x">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 border-b">
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">Libellé</th>
                          <th className="px-4 py-2">T</th>
                          <th className="px-4 py-2 text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.entries.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                              Aucun encaissement — ajoutez votre premier CA
                            </td>
                          </tr>
                        )}
                        {data.entries.slice(0, 30).map((e) => (
                          <tr key={e.id} className="border-b border-gray-50">
                            <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{e.entryDate}</td>
                            <td className="px-4 py-2">
                              <p className="font-medium text-gray-800 truncate max-w-[180px]">{e.label || '—'}</p>
                              {e.clientName && <p className="text-[10px] text-gray-400">{e.clientName}</p>}
                            </td>
                            <td className="px-4 py-2 text-gray-500">T{e.quarter}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatMad(e.amountMad)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : null}
      </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md p-6 space-y-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <h3 className="font-semibold text-gray-800">Nouvel encaissement de CA</h3>
              <input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={form.amountMad} onChange={(e) => setForm({ ...form, amountMad: e.target.value })} placeholder="Montant encaissé (MAD) *" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" inputMode="decimal" />
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Libellé" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Client" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={form.invoiceRef} onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })} placeholder="Réf. facture" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={mutating} onClick={() => setShowForm(false)} className="min-h-11 px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" disabled={mutating} onClick={() => void addTurnover()} className="min-h-11 px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-xl disabled:opacity-50">
                  {mutating ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
    </ModuleAppShell>
  );
}
