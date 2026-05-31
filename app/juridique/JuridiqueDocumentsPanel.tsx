'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Bot, Download, FileText, Gavel, Mail, ScrollText, Send, User } from 'lucide-react';
import { fetchAi } from '@/app/lib/fetch-ai';
import { persistLegalDocument } from '@/app/juridique/juridique-persist';

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
  category: string;
  name: string;
  description: string;
  fields: string[];
};

type Message = { role: 'user' | 'assistant'; content: string };

const docs: Doc[] = [
  { id: 'attestation_capital', category: 'Attestations', name: 'Attestation de capital', description: 'Attestation de libération du capital social', fields: ['montant_capital', 'date_liberation', 'banque', 'gerant'] },
  { id: 'attestation_domicile', category: 'Attestations', name: 'Attestation de domiciliation', description: 'Attestation de siège social domicilié', fields: ['domiciliataire', 'adresse_domicile', 'date_debut', 'gerant'] },
  { id: 'attestation_non_litige', category: 'Attestations', name: 'Attestation de non-litige', description: 'Attestation sur l’absence de litiges en cours', fields: ['destinataire', 'objet', 'date', 'gerant'] },
  { id: 'contrat_prestation', category: 'Contrats', name: 'Contrat de prestation', description: 'Contrat de prestation de services B2B', fields: ['prestataire', 'client', 'objet', 'duree', 'honoraires', 'modalites_paiement'] },
  { id: 'contrat_bail', category: 'Contrats', name: 'Contrat de bail commercial', description: 'Location de local commercial', fields: ['bailleur', 'locataire', 'adresse_local', 'loyer_mensuel', 'duree_bail', 'depot_garantie'] },
  { id: 'nda', category: 'Contrats', name: 'Accord de confidentialité (NDA)', description: 'Non-disclosure agreement', fields: ['partie_1', 'partie_2', 'objet_confidentialite', 'duree', 'date'] },
  { id: 'courrier_officiel', category: 'Courriers', name: 'Courrier officiel', description: 'Courrier formel à une administration ou institution', fields: ['destinataire', 'objet', 'reference', 'corps_demande', 'pieces_jointes'] },
  { id: 'courrier_client', category: 'Courriers', name: 'Courrier client / partenaire', description: 'Courrier commercial ou relationnel', fields: ['destinataire', 'objet', 'message', 'delai_reponse'] },
  { id: 'relance_paiement', category: 'Courriers', name: 'Lettre de relance', description: 'Relance amiable de facture impayée', fields: ['debiteur', 'montant_du', 'numero_facture', 'date_echeance', 'delai_reglement'] },
  { id: 'pv_ago', category: 'Procès-verbaux', name: 'PV Assemblée Générale Ordinaire', description: 'PV AGO annuelle (approbation comptes, affectation)', fields: ['date_age', 'gerant', 'exercice', 'resultat_net', 'affectation'] },
  { id: 'pv_age', category: 'Procès-verbaux', name: 'PV Assemblée Extraordinaire', description: 'PV AGE (modification statuts, capital, etc.)', fields: ['date_age', 'gerant', 'ordre_du_jour', 'resolutions'] },
  { id: 'mise_demeure_paiement', category: 'Mises en demeure', name: 'Mise en demeure de paiement', description: 'Mise en demeure formelle avant action judiciaire', fields: ['debiteur', 'adresse_debiteur', 'montant_du', 'motif', 'delai_jours'] },
  { id: 'mise_demeure_contractuelle', category: 'Mises en demeure', name: 'Mise en demeure contractuelle', description: 'Mise en demeure pour manquement contractuel', fields: ['destinataire', 'contrat_reference', 'manquement', 'delai_regularisation'] },
  { id: 'avenant_statuts', category: 'Statuts', name: 'Avenant aux statuts', description: 'Modification partielle des statuts', fields: ['article_modifie', 'ancien_texte', 'nouveau_texte', 'date_age', 'gerant'] },
];

const categories = ['Attestations', 'Contrats', 'Courriers', 'Procès-verbaux', 'Mises en demeure', 'Statuts'];

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

export function JuridiqueDocumentsPanel({ companies }: { companies: Company[] }) {
  const [selectedCategory, setSelectedCategory] = useState(categories[0]);
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

  const filteredDocs = docs.filter((d) => d.category === selectedCategory);

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
            <h2 className="font-bold text-gray-800">{selectedDoc?.name}</h2>
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
            <h2 className="font-bold text-gray-800 text-sm">{selectedDoc?.name}</h2>
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
    <div className="flex-1 flex overflow-hidden">
      <div className="w-56 border-r bg-gray-50 p-3 space-y-1 shrink-0">
        {categories.map((cat) => {
          const Icon = categoryIcons[cat] ?? FileText;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${selectedCategory === cat ? 'bg-white shadow text-amber-700 font-medium' : 'text-gray-500 hover:bg-white/60'}`}
            >
              <Icon size={12} /> {cat}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="font-bold text-gray-800 mb-1">Documents juridiques</h2>
        <p className="text-xs text-gray-400 mb-4">Contrats, attestations, courriers, PV, mises en demeure — persistés dans Supabase.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {filteredDocs.map((d) => (
            <button key={d.id} type="button" onClick={() => startDoc(d)} className="text-left p-4 bg-white border rounded-xl hover:border-amber-400 hover:shadow-sm transition-all">
              <p className="font-semibold text-sm text-gray-800">{d.name}</p>
              <p className="text-xs text-gray-400 mt-1">{d.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
