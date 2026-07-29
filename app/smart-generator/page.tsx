'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveAtlasCompany, getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { normalizeIce, normalizeIf } from '@/app/lib/atlas-morocco-compliance';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type { SmartGeneratorDocType, SmartGeneratorItemSpec } from '@/app/types/atlas-smart-generator';

type CompanyMode = 'none' | 'active' | 'manual';

type ItemRow = SmartGeneratorItemSpec & { id: string };

type GeneratedDoc = {
  id?: string;
  number: string;
  docTitle?: string;
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
  persisted?: boolean;
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
  { id: 'autre', label: 'Autre / Custom', labelAr: 'مخصص' },
];

const UNITS = ['Pcs', 'Heures', 'Forfait', 'Kg', 'm²', 'Lot', 'Jour'];

const EMPTY_ITEM = (): ItemRow => ({
  id: crypto.randomUUID(),
  category: '',
  designation: '',
  quantity: 1,
  unit: 'Pcs',
  unitPriceHT: undefined,
  unitPriceMin: undefined,
  unitPriceMax: undefined,
  vatRatePercent: 20,
});

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
  const [companies, setCompanies] = useState<AtlasCompany[]>([]);
  const [activeCompany, setActiveCompany] = useState<AtlasCompany | null>(null);
  const [companyMode, setCompanyMode] = useState<CompanyMode>('active');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [persistToDb, setPersistToDb] = useState(true);

  const [manualHeader, setManualHeader] = useState({
    raisonSociale: '',
    ice: '',
    if_fiscal: '',
    rc: '',
    adresse: '',
    ville: '',
    patent: '',
  });

  const [docType, setDocType] = useState<SmartGeneratorDocType>('facture');
  const [customDocTitle, setCustomDocTitle] = useState('');
  const [language, setLanguage] = useState<'fr' | 'ar' | 'darija'>('fr');
  const [prompt, setPrompt] = useState('');
  const [defaultClient, setDefaultClient] = useState('');
  const [documentCount, setDocumentCount] = useState(1);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [showItemBuilder, setShowItemBuilder] = useState(false);

  const [dateDebut, setDateDebut] = useState(monthStartYmd());
  const [dateFin, setDateFin] = useState(todayYmd());
  const [numeroDebut, setNumeroDebut] = useState(1);
  const [numeroFin, setNumeroFin] = useState(20);
  const [montantMax, setMontantMax] = useState(50000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length));

  const reloadCompanies = useCallback(async () => {
    const [list, active, cid] = await Promise.all([
      listAtlasCompanies(),
      getActiveAtlasCompany(),
      getActiveCompanyDbRowId(),
    ]);
    setCompanies(list);
    setActiveCompany(active);
    if (cid) setSelectedCompanyId(cid);
    if (active && companyMode === 'active') {
      const json = active as Record<string, unknown>;
      setManualHeader({
        raisonSociale: active.raisonSociale ?? '',
        ice: active.ice ?? '',
        if_fiscal: active.if_fiscal ?? '',
        rc: active.rc ?? '',
        adresse: active.adresse ?? '',
        ville: active.ville ?? '',
        patent: String(json.taxeProfessionnelle ?? json.patent ?? ''),
      });
    }
  }, [companyMode]);

  useEffect(() => {
    void reloadCompanies();
    const off = onCompanySwitched(() => { void reloadCompanies(); });
    return off;
  }, [reloadCompanies]);

  const applyCompanyToHeader = (c: AtlasCompany) => {
    const json = c as Record<string, unknown>;
    setManualHeader({
      raisonSociale: c.raisonSociale ?? '',
      ice: c.ice ?? '',
      if_fiscal: c.if_fiscal ?? '',
      rc: c.rc ?? '',
      adresse: c.adresse ?? '',
      ville: c.ville ?? '',
      patent: String(json.taxeProfessionnelle ?? json.patent ?? ''),
    });
  };

  const branding = useMemo(() => ({
    name: manualHeader.raisonSociale || '—',
    ice: manualHeader.ice ? normalizeIce(manualHeader.ice) : '—',
    ifFiscal: manualHeader.if_fiscal ? normalizeIf(manualHeader.if_fiscal) : '—',
    rc: manualHeader.rc || '—',
    patent: manualHeader.patent || '—',
    header: [manualHeader.adresse, manualHeader.ville].filter(Boolean).join(', ') || '—',
  }), [manualHeader]);

  const filledItems = items.filter((i) => i.designation.trim());
  const canGenerate = Boolean(prompt.trim() || filledItems.length);

  const generate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError('');
    setResult(null);

    const companyId =
      companyMode === 'active' && selectedCompanyId ? selectedCompanyId :
      companyMode === 'manual' && persistToDb && selectedCompanyId ? selectedCompanyId :
      null;

    try {
      const res = await fetch('/api/smart-generator/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          persistToDb: companyId ? persistToDb : false,
          customHeader: companyMode !== 'none' ? {
            raisonSociale: manualHeader.raisonSociale,
            ice: manualHeader.ice,
            if_fiscal: manualHeader.if_fiscal,
            rc: manualHeader.rc,
            adresse: manualHeader.adresse,
            ville: manualHeader.ville,
            patent: manualHeader.patent,
          } : {},
          prompt: prompt.trim(),
          docType,
          customDocTitle: docType === 'autre' ? customDocTitle : undefined,
          language,
          default_client_name: defaultClient,
          document_count: documentCount,
          date_debut: dateDebut,
          date_fin: dateFin,
          numero_debut: numeroDebut,
          numero_fin: numeroFin,
          montant_max_par_document: montantMax,
          itemSpecs: filledItems.map(({ id: _id, ...rest }) => rest),
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
        <header className="bg-white border-b px-8 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Wand2 className="text-indigo-600" size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Smart Generator</h1>
              <BetaSurfaceBadge label="Indépendant · Custom · DGI Maroc" className="mt-0.5" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {/* Document types */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Type de document</p>
                <div className="flex flex-wrap gap-2">
                  {DOC_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDocType(t.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        docType === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.label}
                      <span className="text-[10px] opacity-70 ml-1.5">{t.labelAr}</span>
                    </button>
                  ))}
                </div>
                {docType === 'autre' && (
                  <input
                    value={customDocTitle}
                    onChange={(e) => setCustomDocTitle(e.target.value)}
                    placeholder="Titre personnalisé (ex: Bon de Livraison, Attestation, Reçu, Mémoire…)"
                    className="mt-3 w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                )}
              </div>

              {/* Prompt */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Consigne IA (optionnelle si articles remplis)</p>
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
                  rows={4}
                  placeholder={PROMPT_PLACEHOLDERS[placeholderIdx]}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Items builder */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Articles & prestations (prioritaires)</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Ces paramètres remplacent la consigne IA lorsqu&apos;ils sont renseignés</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowItemBuilder(true); if (!items.length) setItems([EMPTY_ITEM()]); }}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    {showItemBuilder ? 'Masquer' : 'Afficher le builder'}
                  </button>
                </div>

                {showItemBuilder && (
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <input
                          value={item.category ?? ''}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, category: e.target.value } : r))}
                          placeholder="Type / catégorie"
                          className="md:col-span-2 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        />
                        <input
                          value={item.designation}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, designation: e.target.value } : r))}
                          placeholder="Désignation précise *"
                          className="md:col-span-3 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        />
                        <input
                          type="number"
                          min={0.001}
                          step="any"
                          value={item.quantity}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, quantity: Number(e.target.value) } : r))}
                          className="md:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                          title="Quantité"
                        />
                        <select
                          value={item.unit}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, unit: e.target.value } : r))}
                          className="md:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        >
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={item.unitPriceHT ?? ''}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, unitPriceHT: e.target.value ? Number(e.target.value) : undefined } : r))}
                          placeholder="PU HT"
                          className="md:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        />
                        <input
                          type="number"
                          min={0}
                          value={item.unitPriceMin ?? ''}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, unitPriceMin: e.target.value ? Number(e.target.value) : undefined } : r))}
                          placeholder="Min"
                          className="md:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        />
                        <input
                          type="number"
                          min={0}
                          value={item.unitPriceMax ?? ''}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, unitPriceMax: e.target.value ? Number(e.target.value) : undefined } : r))}
                          placeholder="Max"
                          className="md:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        />
                        <select
                          value={item.vatRatePercent ?? 20}
                          onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, vatRatePercent: Number(e.target.value) } : r))}
                          className="md:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        >
                          {[0, 7, 10, 14, 20].map((r) => <option key={r} value={r}>TVA {r}%</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="md:col-span-1 flex items-center justify-center text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setItems((prev) => [...prev, EMPTY_ITEM()])}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                    >
                      <Plus size={14} /> Ajouter une ligne
                    </button>
                  </div>
                )}
              </div>

              {/* Advanced params */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-4">Paramètres avancés</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Client par défaut</label>
                    <input value={defaultClient} onChange={(e) => setDefaultClient(e.target.value)}
                      placeholder="Nom client / destinataire"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Nombre de documents</label>
                    <input type="number" min={1} value={documentCount}
                      onChange={(e) => setDocumentCount(Math.max(1, Number(e.target.value)))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Montant max / document (MAD)</label>
                    <input type="number" min={0} value={montantMax} onChange={(e) => setMontantMax(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
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
                    <label className="text-xs text-gray-500 mb-1 block">N° début → fin</label>
                    <div className="flex gap-2">
                      <input type="number" min={1} value={numeroDebut} onChange={(e) => setNumeroDebut(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                      <input type="number" min={numeroDebut} value={numeroFin} onChange={(e) => setNumeroFin(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <button
                type="button"
                disabled={loading || !canGenerate}
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
                          {result.provider ? ` · ${result.provider}` : ''}
                          {result.persisted ? ' · Enregistré en base' : ' · Export uniquement'}
                        </p>
                      )}
                    </div>
                    {result.exports && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => downloadBase64(result.exports!.pdfBase64, result.exports!.pdfFilename, 'application/pdf')}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                          <FileText size={14} className="text-red-600" /> PDF
                        </button>
                        <button type="button" onClick={() => downloadBase64(result.exports!.excelBase64, result.exports!.excelFilename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                          <FileSpreadsheet size={14} className="text-emerald-600" /> Excel DGI
                        </button>
                      </div>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                        <th className="px-4 py-3">N°</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3 text-right">TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.documents.map((d) => (
                        <tr key={d.id ?? d.number} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700">{d.number}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{d.docTitle ?? docType}</td>
                          <td className="px-4 py-3 text-gray-600">{d.clientName}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatMad(d.totalTTC)} MAD</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Company / header panel */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sticky top-6 space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">En-tête & société</p>

                <div className="flex flex-col gap-2">
                  {([
                    ['none', 'Sans société (en-tête libre / vide)'],
                    ['active', 'Préremplir depuis société active'],
                    ['manual', 'Saisie manuelle complète'],
                  ] as const).map(([mode, label]) => (
                    <label key={mode} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="companyMode"
                        checked={companyMode === mode}
                        onChange={() => {
                          setCompanyMode(mode);
                          if (mode === 'active' && activeCompany) applyCompanyToHeader(activeCompany);
                          if (mode === 'none') setManualHeader({ raisonSociale: '', ice: '', if_fiscal: '', rc: '', adresse: '', ville: '', patent: '' });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {companyMode === 'active' && companies.length > 0 && (
                  <select
                    value={selectedCompanyId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedCompanyId(id);
                      const c = companies.find((x) => x.dbRowId === id || String(x.id) === id);
                      if (c) applyCompanyToHeader(c);
                    }}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2"
                  >
                    {companies.map((c) => (
                      <option key={String(c.dbRowId ?? c.id)} value={String(c.dbRowId ?? c.id)}>
                        {c.raisonSociale}
                      </option>
                    ))}
                  </select>
                )}

                {(companyMode === 'manual' || companyMode === 'active') && (
                  <div className="space-y-2">
                    <input value={manualHeader.raisonSociale} onChange={(e) => setManualHeader((h) => ({ ...h, raisonSociale: e.target.value }))}
                      placeholder="Raison sociale" className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={manualHeader.ice} onChange={(e) => setManualHeader((h) => ({ ...h, ice: e.target.value }))}
                        placeholder="ICE" className="px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono" />
                      <input value={manualHeader.if_fiscal} onChange={(e) => setManualHeader((h) => ({ ...h, if_fiscal: e.target.value }))}
                        placeholder="IF" className="px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono" />
                      <input value={manualHeader.rc} onChange={(e) => setManualHeader((h) => ({ ...h, rc: e.target.value }))}
                        placeholder="RC" className="px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono" />
                      <input value={manualHeader.patent} onChange={(e) => setManualHeader((h) => ({ ...h, patent: e.target.value }))}
                        placeholder="Patente" className="px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono" />
                    </div>
                    <input value={manualHeader.adresse} onChange={(e) => setManualHeader((h) => ({ ...h, adresse: e.target.value }))}
                      placeholder="Adresse" className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" />
                    <input value={manualHeader.ville} onChange={(e) => setManualHeader((h) => ({ ...h, ville: e.target.value }))}
                      placeholder="Ville" className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" />
                  </div>
                )}

                {selectedCompanyId && companyMode !== 'none' && (
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={persistToDb} onChange={(e) => setPersistToDb(e.target.checked)} />
                    Enregistrer dans atlas_invoices (optionnel)
                  </label>
                )}

                <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-800">{branding.name}</p>
                      <p className="text-[10px] text-gray-500">{branding.header}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">ICE </span>{branding.ice}</div>
                    <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">IF </span>{branding.ifFiscal}</div>
                    <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">RC </span>{branding.rc}</div>
                    <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">Pat. </span>{branding.patent}</div>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                  <p className="font-semibold text-gray-600">Mode indépendant</p>
                  <p>• Génération sans société en base possible</p>
                  <p>• Articles explicites prioritaires sur l&apos;IA</p>
                  <p>• Types custom: BL, Attestation, Avoir…</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
