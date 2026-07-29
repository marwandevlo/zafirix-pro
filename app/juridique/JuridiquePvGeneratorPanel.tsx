'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Download, FileText, Gavel, Loader2, Sparkles } from 'lucide-react';
import type { JuridiqueCompany } from '@/app/juridique/juridique-types';
import { persistLegalDocument } from '@/app/juridique/juridique-persist';
import type { GeneratedPvDocument, PvAgeResolutionType, PvAssemblyType } from '@/app/types/atlas-juridique-pv';
import { buildMoroccanLegalHeaderBlock, juridiqueCompanyToLegalIds } from '@/app/lib/atlas-juridique-pv';

type Company = JuridiqueCompany & { dbRowId?: string; companyJson?: Record<string, unknown> };

const AGE_RESOLUTION_TYPES: { value: PvAgeResolutionType; label: string }[] = [
  { value: 'modification_statuts', label: 'Modification des statuts' },
  { value: 'augmentation_capital', label: 'Augmentation de capital' },
  { value: 'reduction_capital', label: 'Réduction de capital' },
  { value: 'cession_parts', label: 'Cession de parts sociales' },
  { value: 'transfert_siege', label: 'Transfert de siège social' },
  { value: 'changement_denomination', label: 'Changement de dénomination' },
  { value: 'autre', label: 'Autre (AGE)' },
];

async function downloadWord(content: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import('docx');
  const paragraphs = content.split('\n').map((line) => {
    const t = line.trim();
    const centered =
      t.startsWith('PROCES-VERBAL') ||
      t === t.toUpperCase() && t.length > 3 && t.length < 80 && !t.includes('MAD');
    return new Paragraph({
      alignment: centered ? AlignmentType.CENTER : undefined,
      children: [new TextRun({ text: line, size: 20, bold: centered })],
      spacing: { after: 80 },
    });
  });
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function JuridiquePvGeneratorPanel({ companies }: { companies: Company[] }) {
  const [phase, setPhase] = useState<'select' | 'form' | 'done'>('select');
  const [assemblyType, setAssemblyType] = useState<PvAssemblyType>('ago');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingIs, setLoadingIs] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState<GeneratedPvDocument | null>(null);
  const [persistStatus, setPersistStatus] = useState('');

  const [agoForm, setAgoForm] = useState({
    dateAssemblee: '',
    exercice: String(new Date().getFullYear() - 1),
    resultatNet: '',
    affectation: 'Report à nouveau / Réserve légale / Dividendes selon les statuts.',
    dirigeant: '',
    participants: '',
    lieu: '',
  });

  const [ageForm, setAgeForm] = useState({
    dateAssemblee: '',
    ordreDuJour: '',
    resolutions: '',
    resolutionType: 'modification_statuts' as PvAgeResolutionType,
    dirigeant: '',
    participants: '',
    lieu: '',
    cedant: '',
    cessionnaire: '',
    nombreParts: '',
    prixCession: '',
    capitalActuel: '',
    capitalNouveau: '',
  });

  const companyDbId =
    selectedCompany?.dbRowId ??
    (typeof selectedCompany?.id === 'string' ? selectedCompany.id : undefined);

  const loadIsResult = useCallback(async () => {
    if (!companyDbId || !agoForm.exercice) return;
    setLoadingIs(true);
    setError('');
    try {
      const res = await fetch(
        `/api/juridique/pv/generate?companyId=${encodeURIComponent(companyDbId)}&fiscalYear=${encodeURIComponent(agoForm.exercice)}`,
        { credentials: 'include' },
      );
      const data = (await res.json()) as { resultatNet?: number | null; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Erreur chargement IS');
      if (data.resultatNet != null) {
        setAgoForm((f) => ({ ...f, resultatNet: String(data.resultatNet) }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger le résultat IS.');
    } finally {
      setLoadingIs(false);
    }
  }, [companyDbId, agoForm.exercice]);

  const startPv = (type: PvAssemblyType, company: Company) => {
    setAssemblyType(type);
    setSelectedCompany(company);
    setPhase('form');
    setGenerated(null);
    setPersistStatus('');
    setError('');
  };

  const generate = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    setError('');
    try {
      const payload =
        assemblyType === 'ago'
          ? { assemblyType, companyId: companyDbId ?? undefined, ago: agoForm }
          : { assemblyType, companyId: companyDbId ?? undefined, age: ageForm };

      const res = await fetch('/api/juridique/pv/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { document?: GeneratedPvDocument; error?: string };
      if (!res.ok || !data.document) throw new Error(data.error ?? 'Génération impossible');

      setGenerated(data.document);
      setPhase('done');

      const saved = await persistLegalDocument({
        company: selectedCompany,
        procedureId: data.document.procedureId,
        procedureLabel: data.document.title,
        content: data.document.content,
        formData: assemblyType === 'ago' ? agoForm : ageForm,
        linkSource: 'juridique_documents',
      });
      if (saved.ok) {
        setPersistStatus(`Enregistré le ${new Date(saved.generatedAt).toLocaleString('fr-FR')}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur génération PV.');
    } finally {
      setLoading(false);
    }
  };

  if (phase === 'done' && generated) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">{generated.title}</h2>
            <p className="text-xs text-gray-400">{selectedCompany?.raisonSociale} · {persistStatus || 'Généré'}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadWord(generated.content, `${generated.procedureId}_${Date.now()}.docx`)}
              className="flex items-center gap-1 px-3 py-2 bg-[#1B2A4A] text-white rounded-lg text-xs"
            >
              <Download size={13} /> Word
            </button>
            <button type="button" onClick={() => setPhase('select')} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs">
              Retour
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            PV conforme aux mentions légales marocaines (RC, ICE, IF, Capital, Siège, Tribunal de Commerce) — validation juridique recommandée.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
            {generated.content}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'form' && selectedCompany) {
    const legalPreview = juridiqueCompanyToLegalIds(selectedCompany, selectedCompany.companyJson);

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-3 border-b bg-white flex items-center gap-2">
          <button type="button" onClick={() => setPhase('select')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="font-bold text-gray-800 text-sm">
              {assemblyType === 'ago' ? 'PV Assemblée Générale Ordinaire (AGO)' : 'PV Assemblée Générale Extraordinaire (AGE)'}
            </h2>
            <p className="text-xs text-gray-400">{selectedCompany.raisonSociale} · {selectedCompany.formeJuridique}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl">
          <div className="bg-[#1B2A4A]/5 border border-[#1B2A4A]/10 rounded-xl p-4">
            <p className="text-xs font-semibold text-[#1B2A4A] mb-2">Identifiants légaux (inclus automatiquement)</p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
              {buildMoroccanLegalHeaderBlock(legalPreview)}
            </pre>
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {assemblyType === 'ago' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date AGO" value={agoForm.dateAssemblee} onChange={(v) => setAgoForm((f) => ({ ...f, dateAssemblee: v }))} placeholder="JJ/MM/AAAA" />
              <Field label="Exercice comptable" value={agoForm.exercice} onChange={(v) => setAgoForm((f) => ({ ...f, exercice: v }))} placeholder="2025" />
              <div className="sm:col-span-2 flex gap-2 items-end">
                <div className="flex-1">
                  <Field label="Résultat net (MAD)" value={agoForm.resultatNet} onChange={(v) => setAgoForm((f) => ({ ...f, resultatNet: v }))} placeholder="150000" />
                </div>
                <button
                  type="button"
                  onClick={() => void loadIsResult()}
                  disabled={!companyDbId || loadingIs}
                  className="flex items-center gap-1 px-3 py-2 border rounded-lg text-xs text-[#1B2A4A] hover:bg-gray-50 disabled:opacity-50"
                >
                  {loadingIs ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Depuis IS
                </button>
              </div>
              <Field label="Gérant / PDG" value={agoForm.dirigeant} onChange={(v) => setAgoForm((f) => ({ ...f, dirigeant: v }))} />
              <Field label="Lieu" value={agoForm.lieu} onChange={(v) => setAgoForm((f) => ({ ...f, lieu: v }))} placeholder={selectedCompany.ville} />
              <div className="sm:col-span-2">
                <Field label="Affectation du résultat" value={agoForm.affectation} onChange={(v) => setAgoForm((f) => ({ ...f, affectation: v }))} multiline />
              </div>
              <div className="sm:col-span-2">
                <Field label="Participants (optionnel)" value={agoForm.participants} onChange={(v) => setAgoForm((f) => ({ ...f, participants: v }))} multiline />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date AGE" value={ageForm.dateAssemblee} onChange={(v) => setAgeForm((f) => ({ ...f, dateAssemblee: v }))} placeholder="JJ/MM/AAAA" />
              <Field label="Type de modification" value={ageForm.resolutionType} onChange={(v) => setAgeForm((f) => ({ ...f, resolutionType: v as PvAgeResolutionType }))} select={AGE_RESOLUTION_TYPES} />
              <Field label="Gérant / PDG" value={ageForm.dirigeant} onChange={(v) => setAgeForm((f) => ({ ...f, dirigeant: v }))} />
              <Field label="Lieu" value={ageForm.lieu} onChange={(v) => setAgeForm((f) => ({ ...f, lieu: v }))} placeholder={selectedCompany.ville} />
              <div className="sm:col-span-2">
                <Field label="Ordre du jour" value={ageForm.ordreDuJour} onChange={(v) => setAgeForm((f) => ({ ...f, ordreDuJour: v }))} multiline />
              </div>
              <div className="sm:col-span-2">
                <Field label="Résolutions" value={ageForm.resolutions} onChange={(v) => setAgeForm((f) => ({ ...f, resolutions: v }))} multiline />
              </div>
              {(ageForm.resolutionType === 'cession_parts') && (
                <>
                  <Field label="Cédant" value={ageForm.cedant} onChange={(v) => setAgeForm((f) => ({ ...f, cedant: v }))} />
                  <Field label="Cessionnaire" value={ageForm.cessionnaire} onChange={(v) => setAgeForm((f) => ({ ...f, cessionnaire: v }))} />
                  <Field label="Nombre de parts" value={ageForm.nombreParts} onChange={(v) => setAgeForm((f) => ({ ...f, nombreParts: v }))} />
                  <Field label="Prix de cession (MAD)" value={ageForm.prixCession} onChange={(v) => setAgeForm((f) => ({ ...f, prixCession: v }))} />
                </>
              )}
              {(ageForm.resolutionType === 'augmentation_capital' || ageForm.resolutionType === 'reduction_capital') && (
                <>
                  <Field label="Capital actuel (MAD)" value={ageForm.capitalActuel} onChange={(v) => setAgeForm((f) => ({ ...f, capitalActuel: v }))} />
                  <Field label="Nouveau capital (MAD)" value={ageForm.capitalNouveau} onChange={(v) => setAgeForm((f) => ({ ...f, capitalNouveau: v }))} />
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1B2A4A] text-white rounded-xl text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Gavel size={16} />}
            Générer le procès-verbal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="font-bold text-gray-800 mb-1">PV Tribunal de Commerce</h2>
      <p className="text-xs text-gray-400 mb-6">
        Générateur automatisé de procès-verbaux AGO et AGE pour SARL et SA — mentions légales marocaines obligatoires incluses.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <PvTypeCard
          title="PV AGO — Assemblée Ordinaire"
          description="Approbation des comptes annuels, affectation du résultat, quitus au gérant."
          onSelect={() => {}}
          disabled
        />
        <PvTypeCard
          title="PV AGE — Assemblée Extraordinaire"
          description="Modifications statutaires, capital, cession de parts, transfert de siège."
          onSelect={() => {}}
          disabled
        />
      </div>

      <h3 className="text-sm font-semibold text-gray-700 mb-3">Sélectionnez une société et le type de PV</h3>
      <div className="grid gap-3 max-w-2xl">
        {companies.map((c) => (
          <div key={String(c.id)} className="border rounded-xl p-4 bg-white">
            <p className="font-medium text-sm">{c.raisonSociale}</p>
            <p className="text-xs text-gray-400 mb-3">{c.formeJuridique} · RC {c.rc || '—'} · {c.ville}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => startPv('ago', c)} className="px-3 py-1.5 bg-[#1B2A4A] text-white rounded-lg text-xs">
                PV AGO
              </button>
              <button type="button" onClick={() => startPv('age', c)} className="px-3 py-1.5 border border-[#1B2A4A] text-[#1B2A4A] rounded-lg text-xs">
                PV AGE
              </button>
            </div>
          </div>
        ))}
        {!companies.length && (
          <p className="text-sm text-gray-500">Aucune société enregistrée — créez une société dans Paramètres.</p>
        )}
      </div>
    </div>
  );
}

function PvTypeCard({
  title,
  description,
  onSelect,
  disabled,
}: {
  title: string;
  description: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`p-4 border rounded-xl bg-white ${disabled ? 'opacity-60' : ''}`}>
      <FileText size={20} className="text-amber-600 mb-2" />
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
      {!disabled && (
        <button type="button" onClick={onSelect} className="mt-3 text-xs text-[#1B2A4A] font-medium">
          Commencer →
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  select,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  select?: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 block mb-1">{label}</span>
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg">
          {select.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 text-sm border rounded-lg resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border rounded-lg"
        />
      )}
    </label>
  );
}
