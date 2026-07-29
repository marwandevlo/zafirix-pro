'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveAtlasCompany, getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { normalizeIce, normalizeIf } from '@/app/lib/atlas-morocco-compliance';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type { SmartGeneratorDocType } from '@/app/types/atlas-smart-generator';

type GeneratedDoc = {
  id: string;
  number: string;
  clientName: string;
  issueDate: string;
  amountHT: number;
  vatAmount: number;
  totalTTC: number;
  lineCount: number;
};

type GenerateResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  documents?: GeneratedDoc[];
  summary?: { count: number; totalHT: number; totalTVA: number; totalTTC: number };
  provider?: string;
  exports?: {
    pdfFilename: string;
    excelFilename: string;
    pdfBase64: string;
    excelBase64: string;
  };
};

const DOC_TYPES: { id: SmartGeneratorDocType; label: string; labelAr: string }[] = [
  { id: 'facture', label: 'Facture', labelAr: 'فاتورة' },
  { id: 'devis', label: 'Devis', labelAr: 'عرض سعر' },
  { id: 'bon_commande', label: 'Bon de Commande', labelAr: 'أمر شراء' },
];

const PROMPT_PLACEHOLDERS = [
  'Ex: Génère 3 factures pour le client Atlas SARL — prestations comptables 5000 MAD HT/TVA 20%…',
  'مثال: 3 فواتير لخدمات استشارية ب 8000 درهم HT',
  'Ex darija: dir li 2 factures l client BTP Casa — matériaux 12000 dh tva 20%',
];

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatMad(n: number): string {
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SmartGeneratorPage() {
  const [company, setCompany] = useState<Partial<AtlasCompany> | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [docType, setDocType] = useState<SmartGeneratorDocType>('facture');
  const [language, setLanguage] = useState<'fr' | 'ar' | 'darija'>('fr');
  const [prompt, setPrompt] = useState('');
  const [dateDebut, setDateDebut] = useState(monthStartYmd());
  const [dateFin, setDateFin] = useState(todayYmd());
  const [numeroDebut, setNumeroDebut] = useState(1);
  const [numeroFin, setNumeroFin] = useState(20);
  const [montantMax, setMontantMax] = useState(50000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length));

  const reloadCompany = useCallback(async () => {
    const c = await getActiveAtlasCompany();
    const cid = await getActiveCompanyDbRowId();
    setCompany(c);
    setCompanyId(cid);
  }, []);

  useEffect(() => {
    void reloadCompany();
    const off = onCompanySwitched(() => { void reloadCompany(); });
    return off;
  }, [reloadCompany]);

  const branding = useMemo(() => {
    const json = company as Record<string, unknown> | null;
    return {
      name: company?.raisonSociale || '—',
      logo: company?.logoUrl,
      ice: company?.ice ? normalizeIce(company.ice) : '—',
      ifFiscal: company?.if_fiscal ? normalizeIf(company.if_fiscal) : '—',
      rc: company?.rc || '—',
      patent: String(json?.taxeProfessionnelle ?? json?.patent ?? '—'),
      header: [company?.adresse, company?.ville].filter(Boolean).join(', ') || '—',
    };
  }, [company]);

  const generate = async () => {
    if (!prompt.trim() || !companyId) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/smart-generator/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          prompt: prompt.trim(),
          docType,
          language,
          date_debut: dateDebut,
          date_fin: dateFin,
          numero_debut: numeroDebut,
          numero_fin: numeroFin,
          montant_max_par_document: montantMax,
        }),
      });
      const data = await res.json() as GenerateResponse;
      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Génération échouée');
        return;
      }
      setResult(data);
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAtlasSupabaseDataEnabled()) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AppSidebar variant="module" />
        <main className="flex-1 flex items-center justify-center text-sm text-gray-500">Supabase requis.</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-8 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Wand2 className="text-indigo-600" size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Smart Generator</h1>
              <BetaSurfaceBadge label="Factures · Devis · BC — DGI Maroc" className="mt-0.5" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {/* Document type selector */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Type de document</p>
                <div className="flex flex-wrap gap-2">
                  {DOC_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDocType(t.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        docType === t.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.label}
                      <span className="text-[10px] opacity-70 ml-1.5">{t.labelAr}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Natural language command */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Consigne (FR · AR · Darija)</p>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as typeof language)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                  >
                    <option value="fr">Français</option>
                    <option value="ar">العربية</option>
                    <option value="darija">Darija</option>
                  </select>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder={PROMPT_PLACEHOLDERS[placeholderIdx]}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Advanced parameters */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-4">Paramètres avancés</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Date début</label>
                    <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Date fin</label>
                    <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Montant max / document (MAD)</label>
                    <input type="number" min={0} value={montantMax} onChange={(e) => setMontantMax(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">N° début</label>
                    <input type="number" min={1} value={numeroDebut} onChange={(e) => setNumeroDebut(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">N° fin</label>
                    <input type="number" min={numeroDebut} value={numeroFin} onChange={(e) => setNumeroFin(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <button
                type="button"
                disabled={loading || !prompt.trim() || !companyId}
                onClick={() => void generate()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {loading ? 'Génération en cours…' : 'Générer les documents'}
              </button>

              {result?.documents && result.documents.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-gray-800">{result.documents.length} document(s) généré(s)</h2>
                      {result.summary && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          HT {formatMad(result.summary.totalHT)} · TVA {formatMad(result.summary.totalTVA)} · TTC {formatMad(result.summary.totalTTC)} MAD
                          {result.provider ? ` · IA: ${result.provider}` : ''}
                        </p>
                      )}
                    </div>
                    {result.exports && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => downloadBase64(
                            result.exports!.pdfBase64,
                            result.exports!.pdfFilename,
                            'application/pdf',
                          )}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          <FileText size={14} className="text-red-600" /> PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadBase64(
                            result.exports!.excelBase64,
                            result.exports!.excelFilename,
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                          )}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          <FileSpreadsheet size={14} className="text-emerald-600" /> Excel DGI
                        </button>
                      </div>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3">N°</th>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">TTC</th>
                        <th className="px-4 py-3">Lignes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.documents.map((d) => (
                        <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700">{d.number}</td>
                          <td className="px-4 py-3 text-gray-600">{d.clientName}</td>
                          <td className="px-4 py-3 text-gray-500">{d.issueDate}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatMad(d.totalTTC)} MAD</td>
                          <td className="px-4 py-3 text-gray-400">{d.lineCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Branding preview */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sticky top-6">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-4">Aperçu en-tête société</p>
                <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {branding.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={branding.logo} alt="Logo" className="w-12 h-12 object-contain rounded-lg bg-white border" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Building2 size={20} className="text-indigo-600" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-gray-800">{branding.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{branding.header}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-gray-400">ICE</span>
                      <p className="font-mono font-medium text-gray-700">{branding.ice}</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-gray-400">IF</span>
                      <p className="font-mono font-medium text-gray-700">{branding.ifFiscal}</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-gray-400">RC</span>
                      <p className="font-mono font-medium text-gray-700">{branding.rc}</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-gray-400">Patente</span>
                      <p className="font-mono font-medium text-gray-700">{branding.patent}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-indigo-600 font-medium">
                    ✓ En-tête · Logo · Identifiants légaux appliqués aux exports PDF & Excel
                  </p>
                </div>

                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                  <p className="font-semibold text-gray-600">Conformité intégrée</p>
                  <p>• TVA DGI: 0 · 7 · 10 · 14 · 20 %</p>
                  <p>• Comptes PCGE sur chaque ligne</p>
                  <p>• Enregistrement `atlas_invoices` (brouillon)</p>
                  <p>• Découpage auto si plafond TTC dépassé</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
