'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calculator, CheckCircle, FileCode, FileSpreadsheet, Globe, Loader2 } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { EXPERT_DISCLAIMER, computeIsLiquidation } from '@/app/lib/atlas-payroll-calculations';
import { FiscalCompliancePanel } from '@/app/components/compliance/FiscalCompliancePanel';
import type { AtlasIsDraft } from '@/app/types/atlas-payroll';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

export default function ISPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [draft, setDraft] = useState<AtlasIsDraft | null>(null);
  const [history, setHistory] = useState<AtlasIsDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [xmlGenerated, setXmlGenerated] = useState(false);
  const [excelGenerated, setExcelGenerated] = useState(false);
  const [exportingXml, setExportingXml] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const loadHistory = useCallback(async (cid: string) => {
    const res = await apiFetch<{ drafts?: AtlasIsDraft[] }>(`/api/is/drafts?companyId=${encodeURIComponent(cid)}`);
    if (res.ok) {
      const drafts = res.data.drafts ?? [];
      setHistory(drafts);
      const forYear = drafts.find((d) => d.fiscalYear === fiscalYear) ?? null;
      setDraft(forYear);
    }
  }, [fiscalYear]);

  useEffect(() => {
    void (async () => {
      if (!isAtlasSupabaseDataEnabled()) return;
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
    })();
  }, []);

  useEffect(() => {
    if (!companyId || !isAtlasSupabaseDataEnabled()) return;
    void loadHistory(companyId);
  }, [companyId, fiscalYear, loadHistory]);

  const computeIs = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ draft?: AtlasIsDraft; error?: string }>('/api/is/drafts', {
        method: 'POST',
        body: JSON.stringify({ companyId, fiscalYear }),
      });
      if (!res.ok || !res.data.draft) {
        setError(res.data.error ?? 'Calcul impossible');
        return;
      }
      setDraft(res.data.draft);
      await loadHistory(companyId);
    } finally {
      setLoading(false);
    }
  };

  const validateDraft = async () => {
    if (!draft) return;
    const res = await apiFetch<{ draft?: AtlasIsDraft }>(`/api/is/drafts/${draft.id}/validate`, { method: 'POST' });
    if (res.ok && res.data.draft) setDraft(res.data.draft);
  };

  const downloadExcel = async () => {
    if (!companyId) return;
    if (!draft) {
      setError('Calculez d\'abord le brouillon IS pour cet exercice.');
      return;
    }
    setExportingExcel(true);
    setError('');
    setExcelGenerated(false);
    try {
      const params = new URLSearchParams({
        companyId,
        fiscalYear: String(draft.fiscalYear),
        draftId: draft.id,
      });
      const res = await fetch(`/api/is/export-excel?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setError(body.message ?? body.error ?? 'Export Excel impossible.');
        return;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('spreadsheet') && !contentType.includes('excel')) {
        setError('Réponse export invalide (attendu Excel .xlsx).');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IS_${draft.fiscalYear}_DGI.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExcelGenerated(true);
    } catch {
      setError('Erreur réseau lors de l\'export Excel IS.');
    } finally {
      setExportingExcel(false);
    }
  };

  const generateXML = async () => {
    if (!companyId) return;
    if (!draft) {
      setError('Calculez d\'abord le brouillon IS pour cet exercice.');
      return;
    }
    setExportingXml(true);
    setError('');
    setXmlGenerated(false);
    try {
      const params = new URLSearchParams({
        companyId,
        fiscalYear: String(draft.fiscalYear),
        draftId: draft.id,
      });

      const res = await fetch(`/api/is/export?${params.toString()}`, { credentials: 'include' });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setError(body.message ?? body.error ?? 'Export XML impossible.');
        return;
      }
      if (!contentType.includes('xml')) {
        setError('Réponse export invalide (attendu XML).');
        return;
      }
      const blob = await res.blob();
      if (blob.size < 600) {
        setError('Fichier XML trop petit — vérifiez que le brouillon IS contient des données.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IS_${draft.fiscalYear}_DGI.xml`;
      a.click();
      URL.revokeObjectURL(url);
      setXmlGenerated(true);
    } catch {
      setError('Erreur réseau lors de l\'export XML IS.');
    } finally {
      setExportingXml(false);
    }
  };

  const liquidation = draft
    ? computeIsLiquidation(draft.revenueHT, draft.taxableResult, draft.fiscalYear)
    : null;

  const bareme = draft
    ? [
        { tranche: '0 - 300 000 MAD', taux: '10%', actif: draft.taxableResult > 0 && draft.taxableResult <= 300_000 },
        { tranche: '300 001 - 1 000 000 MAD', taux: '20%', actif: draft.taxableResult > 300_000 && draft.taxableResult <= 1_000_000 },
        { tranche: '1 000 001 - 5 000 000 MAD', taux: '26%', actif: draft.taxableResult > 1_000_000 && draft.taxableResult <= 5_000_000 },
        { tranche: 'Plus de 5 000 000 MAD', taux: '31%', actif: draft.taxableResult > 5_000_000 },
      ]
    : [];

  if (!isAtlasSupabaseDataEnabled()) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AppSidebar variant="module" />
        <main className="flex-1 flex items-center justify-center text-sm text-gray-500">Supabase requis pour le module IS.</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-800">Impôt sur Sociétés (IS)</h1>
              <BetaSurfaceBadge />
            </div>
            <p className="text-xs text-amber-700 mt-0.5">{EXPERT_DISCLAIMER} · Données factures / achats / paie / comptabilité</p>
          </div>
          {(draft || companyId) && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void downloadExcel()}
                disabled={!companyId || !draft || exportingExcel}
                className="flex items-center gap-2 px-4 py-2 bg-[#1F497D] text-white rounded-lg text-sm hover:bg-[#16365c] transition-colors disabled:opacity-50"
                title={draft ? 'Exporter le brouillon IS en Excel DGI' : 'Calculez le brouillon IS avant export'}
              >
                {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                Exporter Excel DGI
              </button>
              <button
                type="button"
                onClick={() => void generateXML()}
                disabled={!companyId || !draft || exportingXml}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50"
                title={draft ? 'Exporter le brouillon IS en XML DGI' : 'Calculez le brouillon IS avant export'}
              >
                {exportingXml ? <Loader2 size={16} className="animate-spin" /> : <FileCode size={16} />}
                XML DGI
              </button>
              <button type="button" onClick={() => window.open('https://www.tax.gov.ma', '_blank')} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm"><Globe size={16} /> SIMPL-IS</button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {!companyId && <div className="text-sm text-amber-800 bg-amber-50 border rounded-xl px-4 py-3">Sélectionnez une société active.</div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

          <FiscalCompliancePanel fiscalYear={fiscalYear} compact />

          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <h2 className="font-semibold text-gray-700 mb-4">Calcul IS depuis données réelles</h2>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Exercice fiscal</label>
                <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg">
                  {[2026, 2025, 2024].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => void computeIs()} disabled={loading || !companyId} className="flex items-center gap-2 px-4 py-2.5 bg-[#1B2A4A] text-white rounded-lg text-sm disabled:opacity-50">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                Calculer IS (brouillon)
              </button>
            </div>
          </div>

          {draft && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 border"><p className="text-xs text-gray-400">CA HT (factures)</p><p className="text-xl font-bold">{draft.revenueHT.toLocaleString()} MAD</p></div>
                <div className="bg-white rounded-xl p-5 border"><p className="text-xs text-gray-400">Résultat fiscal</p><p className={`text-xl font-bold ${draft.taxableResult >= 0 ? 'text-gray-800' : 'text-red-600'}`}>{draft.taxableResult.toLocaleString()} MAD</p></div>
                <div className="bg-white rounded-xl p-5 border"><p className="text-xs text-gray-400">IS estimé</p><p className="text-xl font-bold text-red-600">{draft.isDue.toFixed(0)} MAD</p></div>
                <div className="bg-white rounded-xl p-5 border"><p className="text-xs text-gray-400">Statut · {draft.formulaVersion}</p><p className="text-xl font-bold">{draft.status}</p></div>
              </div>

              <div className="bg-white rounded-xl p-5 border text-sm grid grid-cols-2 gap-3">
                <p>Achats fournisseurs HT: <strong>{draft.supplierExpensesHT.toLocaleString()} MAD</strong></p>
                <p>Masse salariale (paie): <strong>{draft.payrollTotal.toLocaleString()} MAD</strong></p>
                <p>Charges comptables: <strong>{draft.accountingCharges.toLocaleString()} MAD</strong></p>
                <p>Cotisation minimale (0,5% CA): <strong>{draft.minimalContribution.toLocaleString()} MAD</strong></p>
                {liquidation?.cotisationMinimaleAppliquee && (
                  <p className="sm:col-span-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    La cotisation minimale s&apos;applique — impôt dû = max(IS calculé, 0,5% du chiffre d&apos;affaires HT).
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-6 border">
                  <h2 className="font-semibold mb-4">Barème IS indicatif</h2>
                  {bareme.map((b, i) => (
                    <div key={i} className={`flex justify-between px-4 py-3 rounded-lg text-sm mb-2 ${b.actif ? 'bg-[#1B2A4A] text-white' : 'bg-gray-50'}`}>
                      <span>{b.tranche}</span><span className="font-bold">{b.taux}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl p-6 border">
                  <h2 className="font-semibold mb-4">Acomptes provisionnels IS ({liquidation?.acomptesExercice})</h2>
                  {liquidation?.acomptes.length ? (
                    <div className="space-y-2">
                      {liquidation.acomptes.map((a) => (
                        <div key={a.trimestre} className="flex justify-between text-sm px-3 py-2 bg-gray-50 rounded-lg">
                          <span>T{a.trimestre} — échéance {a.echeance}</span>
                          <span className="font-bold text-amber-600">{a.montant.toLocaleString()} MAD</span>
                        </div>
                      ))}
                      <p className="text-xs text-gray-400 pt-2">
                        Total acomptes : {liquidation.totalAcomptes.toLocaleString()} MAD (4 × 25% de l&apos;impôt dû {draft.fiscalYear})
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Calculez le brouillon IS pour voir les acomptes.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => void validateDraft()} disabled={draft.status === 'validated'} className="flex items-center gap-2 px-6 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm disabled:opacity-50">
                  {draft.status === 'validated' ? <><CheckCircle size={14} /> Validé</> : 'Valider brouillon'}
                </button>
              </div>

              {xmlGenerated && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle size={20} className="text-green-500" />
                  <p className="text-sm text-green-700">XML IS généré depuis le brouillon persisté.</p>
                </div>
              )}

              {excelGenerated && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle size={20} className="text-green-500" />
                  <p className="text-sm text-green-700">Fichier Excel IS généré au format DGI.</p>
                </div>
              )}
            </>
          )}

          {history.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold mb-3">Historique brouillons IS</h2>
              {history.map((d) => (
                <div key={d.id} className="flex justify-between text-sm border-b py-2">
                  <span>{d.fiscalYear} · {d.status} · {d.formulaVersion}</span>
                  <span className="font-bold">{d.isDue.toLocaleString()} MAD</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
