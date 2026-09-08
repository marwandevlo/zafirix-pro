'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Bot, Download, FileText, Gavel, Hash, Landmark, Loader2, Mail, Receipt, ScrollText, Send, User } from 'lucide-react';
import { fetchAi } from '@/app/lib/fetch-ai';
import { persistLegalDocument } from '@/app/juridique/juridique-persist';
import type { JuridiqueCategory, JuridiqueUiLocale } from '@/app/types/atlas-juridique-categories';
import { juridiqueLabel } from '@/app/types/atlas-juridique-categories';
import { DEFAULT_MOROCCAN_JURIDIQUE_CATALOG } from '@/app/lib/atlas-juridique-categories-server';

type Company = {
  id: number;
  raisonSociale: string;
  formeJuridique: string;
  if_fiscal: string;
  ice: string;
  rc: string;
  cnss: string;
  adresse: string;
  ville: string;
  telephone: string;
  email: string;
  activite: string;
};

type Doc = {
  id: string;
  categorySlug: string;
  categoryLabelFr: string;
  categoryLabelAr: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  fields: string[];
  isRequired?: boolean;
  uploadPromptFr?: string | null;
  uploadPromptAr?: string | null;
};

type Message = { role: 'user' | 'assistant'; content: string };

/** Legacy AI templates merged when absent from admin catalog. */
const LEGACY_DOCS: Doc[] = [
  { id: 'attestation_capital', categorySlug: 'registre_commerce', categoryLabelFr: 'Registre de Commerce (RC)', categoryLabelAr: 'السجل التجاري', name: 'Attestation de capital', nameAr: 'شهادة رأس المال', description: 'Attestation de libération du capital social', descriptionAr: 'شهادة تحرير رأس المال', fields: ['montant_capital', 'date_liberation', 'banque', 'gerant'] },
  { id: 'attestation_domicile', categorySlug: 'registre_commerce', categoryLabelFr: 'Registre de Commerce (RC)', categoryLabelAr: 'السجل التجاري', name: 'Attestation de domiciliation', nameAr: 'شهادة الت domiciliation', description: 'Attestation de siège social domicilié', descriptionAr: 'شهادة مقر الشركة', fields: ['domiciliataire', 'adresse_domicile', 'date_debut', 'gerant'] },
  { id: 'courrier_officiel', categorySlug: 'conventions', categoryLabelFr: 'Conventions', categoryLabelAr: 'الاتفاقيات', name: 'Courrier officiel', nameAr: 'مراسلة رسمية', description: 'Courrier formel à une administration', descriptionAr: 'مراسلة رسمية مع الإدارة', fields: ['destinataire', 'objet', 'reference', 'corps_demande', 'pieces_jointes'] },
  { id: 'relance_paiement', categorySlug: 'contrats', categoryLabelFr: 'Contrats', categoryLabelAr: 'العقود', name: 'Lettre de relance', nameAr: 'رسالة تذكير', description: 'Relance amiable de facture impayée', descriptionAr: 'تذكير ودي بفاتورة غير مدفوعة', fields: ['debiteur', 'montant_du', 'numero_facture', 'date_echeance', 'delai_reglement'] },
  { id: 'mise_demeure_paiement', categorySlug: 'contrats', categoryLabelFr: 'Contrats', categoryLabelAr: 'العقود', name: 'Mise en demeure de paiement', nameAr: 'إنذار بالأداء', description: 'Mise en demeure formelle avant action judiciaire', descriptionAr: 'إنذار رسمي قبل التقاضي', fields: ['debiteur', 'adresse_debiteur', 'montant_du', 'motif', 'delai_jours'] },
];

function catalogToDocs(catalog: JuridiqueCategory[]): Doc[] {
  const fromDb: Doc[] = [];
  for (const cat of catalog) {
    for (const dt of cat.documentTypes) {
      if (!dt.isActive) continue;
      fromDb.push({
        id: dt.slug,
        categorySlug: cat.slug,
        categoryLabelFr: cat.labelFr,
        categoryLabelAr: cat.labelAr,
        name: dt.labelFr,
        nameAr: dt.labelAr,
        description: dt.descriptionFr ?? cat.descriptionFr ?? '',
        descriptionAr: dt.descriptionAr ?? cat.descriptionAr ?? '',
        fields: dt.fields.map((f) => f.key),
        isRequired: dt.isRequired,
        uploadPromptFr: dt.uploadPromptFr ?? cat.uploadPromptFr,
        uploadPromptAr: dt.uploadPromptAr ?? cat.uploadPromptAr,
      });
    }
  }
  const ids = new Set(fromDb.map((d) => d.id));
  for (const legacy of LEGACY_DOCS) {
    if (!ids.has(legacy.id)) fromDb.push(legacy);
  }
  return fromDb;
}

function catalogCategories(catalog: JuridiqueCategory[]) {
  return catalog
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      slug: c.slug,
      labelFr: c.labelFr,
      labelAr: c.labelAr,
      descriptionFr: c.descriptionFr,
      descriptionAr: c.descriptionAr,
      uploadPromptFr: c.uploadPromptFr,
      uploadPromptAr: c.uploadPromptAr,
    }));
}

const fieldLabels: Record<string, string> = {
  montant_capital: 'Montant du capital (MAD)',
  date_liberation: 'Date de libération du capital',
  banque: 'Banque dépositaire',
  gerant: 'Nom du gérant',
  domiciliataire: 'Société / personne domiciliataire',
  adresse_domicile: 'Adresse de domiciliation',
  date_debut: 'Date de début',
  destinataire: 'Destinataire (nom / organisme)',
  objet: 'Objet du courrier ou de la demande',
  date: 'Date (JJ/MM/AAAA)',
  prestataire: 'Prestataire',
  client: 'Client',
  duree: 'Durée',
  honoraires: 'Honoraires (MAD)',
  modalites_paiement: 'Modalités de paiement',
  bailleur: 'Bailleur',
  locataire: 'Locataire',
  adresse_local: 'Adresse du local',
  loyer_mensuel: 'Loyer mensuel (MAD)',
  duree_bail: 'Durée du bail',
  depot_garantie: 'Dépôt de garantie (MAD)',
  partie_1: 'Partie 1',
  partie_2: 'Partie 2',
  objet_confidentialite: 'Objet de la confidentialité',
  reference: 'Référence interne',
  corps_demande: 'Corps de la demande (résumé)',
  pieces_jointes: 'Pièces jointes mentionnées',
  message: 'Message principal',
  delai_reponse: 'Délai de réponse souhaité',
  debiteur: 'Nom du débiteur',
  montant_du: 'Montant dû (MAD)',
  numero_facture: 'Numéro de facture',
  date_echeance: "Date d'échéance",
  delai_reglement: 'Délai de règlement accordé',
  date_age: "Date de l'assemblée",
  exercice: 'Exercice comptable',
  resultat_net: 'Résultat net (MAD)',
  affectation: 'Affectation du résultat',
  ordre_du_jour: "Ordre du jour",
  resolutions: 'Résolutions à adopter',
  adresse_debiteur: 'Adresse du débiteur',
  motif: 'Motif de la mise en demeure',
  delai_jours: 'Délai en jours',
  contrat_reference: 'Référence du contrat',
  manquement: 'Description du manquement',
  delai_regularisation: 'Délai de régularisation',
  article_modifie: 'Article modifié',
  ancien_texte: 'Ancien texte',
  nouveau_texte: 'Nouveau texte',
};

const categoryIcons: Record<string, LucideIcon> = {
  registre_commerce: Landmark,
  patente: Receipt,
  identifiant_fiscal: FileText,
  ice: Hash,
  statuts_societe: ScrollText,
  proces_verbaux: Gavel,
  contrats: FileText,
  conventions: Mail,
  fichiers_fiscaux: Receipt,
  registres_legaux: ScrollText,
  Attestations: ScrollText,
  Contrats: FileText,
  Courriers: Mail,
  'Procès-verbaux': Gavel,
  'Mises en demeure': Gavel,
  Statuts: ScrollText,
};

const cleanText = (text: string) =>
  text.replace(/\*\*/g, '').replace(/#{1,3} /g, '').replace(/```[\s\S]*?```/g, '').trim();

async function downloadWord(content: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const paragraphs = cleanText(content).split('\n').map((line) =>
    new Paragraph({ children: [new TextRun({ text: line.trim(), size: 20 })], spacing: { after: 80 } }),
  );
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function JuridiqueDocumentsPanel({
  companies,
  lang = 'fr',
}: {
  companies: Company[];
  lang?: JuridiqueUiLocale;
}) {
  const t = (fr: string, ar: string) => juridiqueLabel(lang, fr, ar);
  const [catalog, setCatalog] = useState<JuridiqueCategory[]>(DEFAULT_MOROCCAN_JURIDIQUE_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const categories = useMemo(() => catalogCategories(catalog), [catalog]);
  const docs = useMemo(() => catalogToDocs(catalog), [catalog]);

  const [selectedCategorySlug, setSelectedCategorySlug] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [phase, setPhase] = useState<'list' | 'company' | 'wizard' | 'done'>('list');
  const [step, setStep] = useState(0);
  const [fieldData, setFieldData] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [persistStatus, setPersistStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/juridique/categories', { credentials: 'include' });
        const json = (await res.json()) as { catalog?: JuridiqueCategory[] };
        if (!cancelled && Array.isArray(json.catalog) && json.catalog.length) {
          setCatalog(json.catalog);
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCategorySlug && categories[0]) {
      setSelectedCategorySlug(categories[0].slug);
    }
  }, [categories, selectedCategorySlug]);

  const selectedCategory = categories.find((c) => c.slug === selectedCategorySlug) ?? categories[0];
  const filteredDocs = docs.filter((d) => d.categorySlug === selectedCategory?.slug);

  const startDoc = (doc: Doc) => {
    setSelectedDoc(doc);
    setPhase('company');
    setStep(0);
    setFieldData({});
    setGeneratedContent('');
    setPersistStatus('');
    setMessages([]);
  };

  const pickCompany = (c: Company | null) => {
    setSelectedCompany(c);
    setPhase('wizard');
    setMessages([
      { role: 'assistant', content: `Document : ${selectedDoc?.name}\n\n${fieldLabels[selectedDoc!.fields[0]]} ?` },
    ]);
  };

  const generateDoc = async (data: Record<string, string>) => {
    const c = selectedCompany;
    try {
      const res = await fetchAi({
        type: 'juridique',
        message: `Expert juridique marocain. Genere le document: ${selectedDoc?.name}

SOCIETE:
${c ? `- Raison sociale: ${c.raisonSociale}
- Forme: ${c.formeJuridique}
- Adresse: ${c.adresse} ${c.ville}
- IF: ${c.if_fiscal} | ICE: ${c.ice} | RC: ${c.rc} | CNSS: ${c.cnss}` : '- (non specifiee)'}

DONNEES:
${Object.entries(data).map(([k, v]) => `${fieldLabels[k] || k}: ${v}`).join('\n')}

REGLES:
- Texte juridique professionnel en francais
- Articles numerotes si pertinent
- Mention "Fait a [ville], le [date]"
- Avertissement: document genere automatiquement, a valider par juriste/expert
- Pas de tableaux ASCII ni HTML

Genere UNIQUEMENT le document.`,
      });
      const responseData = (await res.json().catch(() => ({}))) as { response?: string; error?: string };
      if (!res.ok) throw new Error(responseData.error ?? 'Erreur API');
      const text = responseData.response ?? '';
      setGeneratedContent(text);
      setPhase('done');

      const saved = await persistLegalDocument({
        company: c,
        procedureId: selectedDoc?.id ?? 'document_juridique',
        procedureLabel: selectedDoc?.name ?? 'Document juridique',
        content: text,
        formData: data,
        linkSource: 'juridique_documents',
      });
      if (saved.ok) {
        setPersistStatus(
          c
            ? `Enregistré le ${new Date(saved.generatedAt).toLocaleString('fr-FR')} — lié à ${c.raisonSociale}.`
            : `Enregistré le ${new Date(saved.generatedAt).toLocaleString('fr-FR')}.`,
        );
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : 'Erreur génération.' }]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedDoc || loading) return;
    const currentField = selectedDoc.fields[step];
    const newData = { ...fieldData, [currentField]: input };
    setFieldData(newData);
    setMessages((prev) => [...prev, { role: 'user', content: input }]);
    setInput('');
    const nextStep = step + 1;
    setStep(nextStep);
    if (nextStep < selectedDoc.fields.length) {
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'assistant', content: `${fieldLabels[selectedDoc.fields[nextStep]]} ?` }]);
      }, 300);
    } else {
      setLoading(true);
      setMessages((prev) => [...prev, { role: 'assistant', content: '⏳ Génération du document juridique…' }]);
      await generateDoc(newData);
      setLoading(false);
    }
  };

  if (phase === 'done') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">{t(selectedDoc?.name ?? '', selectedDoc?.nameAr ?? '')}</h2>
            <p className="text-xs text-gray-400">{selectedCompany?.raisonSociale ?? 'Sans société'} · {persistStatus || 'Généré'}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadWord(generatedContent, `${selectedDoc?.id ?? 'doc'}.docx`)}
              className="flex items-center gap-1 px-3 py-2 bg-[#1B2A4A] text-white rounded-lg text-xs"
            >
              <Download size={13} /> Word
            </button>
            <button type="button" onClick={() => { setPhase('list'); setSelectedDoc(null); }} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs">
              Retour
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            Document généré par IA — à valider par un juriste ou expert avant usage officiel.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
            {cleanText(generatedContent)}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'wizard') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-3 border-b bg-white flex items-center gap-2">
          <button type="button" onClick={() => setPhase('company')} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={16} /></button>
          <div>
            <h2 className="font-bold text-gray-800 text-sm">{t(selectedDoc?.name ?? '', selectedDoc?.nameAr ?? '')}</h2>
            <p className="text-xs text-gray-400">{selectedCompany?.raisonSociale ?? 'Société non liée'}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center shrink-0"><Bot size={14} className="text-white" /></div>}
              <div className={`max-w-lg px-3 py-2 rounded-xl text-sm ${m.role === 'user' ? 'bg-[#1B2A4A] text-white' : 'bg-white border border-gray-100'}`}>{m.content}</div>
              {m.role === 'user' && <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center shrink-0"><User size={14} /></div>}
            </div>
          ))}
        </div>
        <div className="border-t bg-white px-6 py-4 flex gap-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Votre réponse…" className="flex-1 px-4 py-2 text-sm border rounded-xl focus:outline-none focus:border-amber-400" />
          <button type="button" onClick={sendMessage} disabled={loading} className="px-4 py-2 bg-amber-500 text-white rounded-xl disabled:opacity-50"><Send size={16} /></button>
        </div>
      </div>
    );
  }

  if (phase === 'company') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden p-6">
        <h2 className="font-bold text-gray-800 mb-1">Société concernée</h2>
        <p className="text-xs text-gray-400 mb-4">Sélectionnez une société ou continuez sans lien.</p>
        <div className="grid gap-2 max-w-lg">
          {companies.map((c) => (
            <button key={c.id} type="button" onClick={() => pickCompany(c)} className="text-left px-4 py-3 border rounded-xl hover:border-amber-400 hover:bg-amber-50/50">
              <p className="font-medium text-sm">{c.raisonSociale}</p>
              <p className="text-xs text-gray-400">{c.ville} · RC {c.rc || '—'}</p>
            </button>
          ))}
          <button type="button" onClick={() => pickCompany(null)} className="text-left px-4 py-3 border border-dashed rounded-xl text-sm text-gray-500 hover:border-gray-400">
            Continuer sans société enregistrée
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="w-56 border-r bg-gray-50 p-3 space-y-1 shrink-0">
        {catalogLoading ? (
          <div className="flex justify-center py-6 text-gray-400">
            <Loader2 className="animate-spin" size={16} />
          </div>
        ) : (
          categories.map((cat) => {
            const Icon = categoryIcons[cat.slug] ?? FileText;
            const active = selectedCategory?.slug === cat.slug;
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => setSelectedCategorySlug(cat.slug)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${active ? 'bg-white shadow text-amber-700 font-medium' : 'text-gray-500 hover:bg-white/60'}`}
              >
                <Icon size={12} /> {t(cat.labelFr, cat.labelAr)}
              </button>
            );
          })
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="font-bold text-gray-800 mb-1">{t('Documents juridiques', 'الوثائق القانونية')}</h2>
        <p className="text-xs text-gray-400 mb-1">
          {t(
            'Conformité marocaine : RC, Patente, IF, ICE, Statuts, PV, Contrats, Conventions',
            'امتثال مغربي: السجل التجاري، الضريبة المهنية، IF، ICE، النظام الأساسي، المحاضر، العقود',
          )}
        </p>
        {selectedCategory?.uploadPromptFr ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            {t(selectedCategory.uploadPromptFr ?? '', selectedCategory.uploadPromptAr ?? '')}
          </p>
        ) : null}
        <div className="grid sm:grid-cols-2 gap-3">
          {filteredDocs.map((d) => (
            <button key={d.id} type="button" onClick={() => startDoc(d)} className="text-left p-4 bg-white border rounded-xl hover:border-amber-400 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm text-gray-800">{t(d.name, d.nameAr)}</p>
                {d.isRequired ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100 shrink-0">
                    {t('Requis', 'إلزامي')}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border shrink-0">
                    {t('Optionnel', 'اختياري')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{t(d.description, d.descriptionAr)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
