'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Bot,
  Download,
  FileText,
  Landmark,
  Send,
  User,
  AlertCircle,
} from 'lucide-react';
import { fetchAi } from '@/app/lib/fetch-ai';
import {
  LEGAL_PROCEDURE_CATEGORIES,
  LEGAL_PROCEDURES,
} from '@/app/juridique/juridique-procedures';
import { persistLegalDocument } from '@/app/juridique/juridique-persist';
import type { JuridiqueCompany, LegalProcedure } from '@/app/juridique/juridique-types';

type Message = { role: 'user' | 'assistant'; content: string };

const categoryIcons: Record<string, LucideIcon> = {
  'Cession & parts': FileText,
  'Modifications statutaires': Landmark,
  Capital: FileText,
  Gérance: User,
  Transformations: Landmark,
  'Fin de vie société': FileText,
  'Formalités RC': Landmark,
  Assemblées: FileText,
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

function companyBlock(c: JuridiqueCompany | null): string {
  if (!c) return '- (non specifiee)';
  return `- Raison sociale: ${c.raisonSociale}
- Forme: ${c.formeJuridique}
- Adresse: ${c.adresse} ${c.ville}
- Tel: ${c.telephone || '—'}
- IF: ${c.if_fiscal} | ICE: ${c.ice} | RC: ${c.rc} | CNSS: ${c.cnss}
- Activite: ${c.activite || '—'}`;
}

export function JuridiqueFormalitesPanel({ companies }: { companies: JuridiqueCompany[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string>(LEGAL_PROCEDURE_CATEGORIES[0]);
  const [selectedProcedure, setSelectedProcedure] = useState<LegalProcedure | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<JuridiqueCompany | null>(null);
  const [phase, setPhase] = useState<'list' | 'company' | 'wizard' | 'done'>('list');
  const [step, setStep] = useState(0);
  const [fieldData, setFieldData] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [persistStatus, setPersistStatus] = useState('');

  const filtered = LEGAL_PROCEDURES.filter((p) => p.category === selectedCategory);

  const startProcedure = (procedure: LegalProcedure) => {
    setSelectedProcedure(procedure);
    setPhase('company');
    setStep(0);
    setFieldData({});
    setGeneratedContent('');
    setPersistStatus('');
    setMessages([]);
  };

  const pickCompany = (c: JuridiqueCompany | null) => {
    setSelectedCompany(c);
    setPhase('wizard');
    const first = selectedProcedure!.fields[0];
    setMessages([
      {
        role: 'assistant',
        content: `Formalité : ${selectedProcedure?.name}${selectedProcedure?.stabilizing ? '\n\n⚠️ En cours de stabilisation — document indicatif à valider par un juriste avant dépôt.' : ''}\n\n${first.label} ?`,
      },
    ]);
  };

  const generateProcedureDoc = async (data: Record<string, string>) => {
    const procedure = selectedProcedure!;
    const c = selectedCompany;
    const hint = procedure.promptHint ? `\nINSTRUCTIONS SPECIFIQUES:\n${procedure.promptHint}` : '';

    const res = await fetchAi({
      type: 'juridique',
      message: `Expert juridique marocain. Genere la formalite: ${procedure.name}

SOCIETE:
${companyBlock(c)}

DONNEES SAISIES:
${procedure.fields.map((f) => `${f.label}: ${data[f.key] ?? ''}`).join('\n')}
${hint}

REGLES:
- Texte juridique professionnel en francais (Maroc)
- En-tete societe si disponible
- Resolutions numerotees pour PV / AGE
- Mention "Fait a [ville], le [date]"
- Pouvoirs au porteur pour formalites RC si pertinent
- Document genere par IA — a valider par juriste/expert avant depot
- Pas de tableaux ASCII ni HTML

Genere UNIQUEMENT le document.`,
    });

    const responseData = (await res.json().catch(() => ({}))) as { response?: string; error?: string };
    if (!res.ok) throw new Error(responseData.error ?? 'Erreur API');
    const text = responseData.response ?? '';
    setGeneratedContent(text);
    setPhase('done');

    const persisted = await persistLegalDocument({
      company: c,
      procedureId: procedure.id,
      procedureLabel: procedure.name,
      content: text,
      formData: data,
      linkSource: 'juridique_formalite',
    });

    if (persisted.ok) {
      setPersistStatus(
        c
          ? `Enregistré le ${new Date(persisted.generatedAt).toLocaleString('fr-FR')} — lié à ${c.raisonSociale}.`
          : `Enregistré le ${new Date(persisted.generatedAt).toLocaleString('fr-FR')}.`,
      );
    } else {
      setPersistStatus('Document généré mais non enregistré (vérifiez la connexion).');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedProcedure || loading) return;
    const currentField = selectedProcedure.fields[step];
    const newData = { ...fieldData, [currentField.key]: input };
    setFieldData(newData);
    setMessages((prev) => [...prev, { role: 'user', content: input }]);
    setInput('');
    const nextStep = step + 1;
    setStep(nextStep);

    if (nextStep < selectedProcedure.fields.length) {
      const next = selectedProcedure.fields[nextStep];
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'assistant', content: `${next.label} ?` }]);
      }, 300);
    } else {
      setLoading(true);
      setMessages((prev) => [...prev, { role: 'assistant', content: '⏳ Génération de la formalité…' }]);
      try {
        await generateProcedureDoc(newData);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: e instanceof Error ? e.message : 'Erreur génération.' },
        ]);
      }
      setLoading(false);
    }
  };

  if (phase === 'done' && selectedProcedure) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-800">{selectedProcedure.name}</h2>
            <p className="text-xs text-gray-400">
              {selectedCompany?.raisonSociale ?? 'Sans société'} · {selectedProcedure.id}
            </p>
            {persistStatus && <p className="text-xs text-green-600 mt-1">{persistStatus}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadWord(generatedContent, `${selectedProcedure.id}.docx`)}
              className="flex items-center gap-1 px-3 py-2 bg-[#1B2A4A] text-white rounded-lg text-xs"
            >
              <Download size={13} /> Word
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('list');
                setSelectedProcedure(null);
              }}
              className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs"
            >
              Retour
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            Document généré par IA — à valider par un juriste ou expert avant tout dépôt au greffe ou usage officiel.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
            {cleanText(generatedContent)}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'wizard' && selectedProcedure) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-3 border-b bg-white flex items-center gap-2">
          <button type="button" onClick={() => setPhase('company')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="font-bold text-gray-800 text-sm">{selectedProcedure.name}</h2>
            <p className="text-xs text-gray-400">{selectedCompany?.raisonSociale ?? 'Société non liée'}</p>
          </div>
        </div>
        {selectedProcedure.stabilizing && (
          <div className="mx-6 mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>En cours de stabilisation — le document est généré à titre indicatif ; les formalités RC peuvent nécessiter des démarches complémentaires.</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center shrink-0">
                  <Bot size={14} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-lg px-3 py-2 rounded-xl text-sm whitespace-pre-line ${
                  m.role === 'user' ? 'bg-[#1B2A4A] text-white' : 'bg-white border border-gray-100'
                }`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                  <User size={14} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="border-t bg-white px-6 py-4 flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Votre réponse…"
            className="flex-1 px-4 py-2 text-sm border rounded-xl focus:outline-none focus:border-amber-400"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={loading}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'company') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden p-6">
        <h2 className="font-bold text-gray-800 mb-1">Société concernée</h2>
        <p className="text-xs text-gray-400 mb-4">
          {selectedProcedure?.name} — le document sera lié à la société et horodaté.
        </p>
        <div className="grid gap-2 max-w-lg">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pickCompany(c)}
              className="text-left px-4 py-3 border rounded-xl hover:border-amber-400 hover:bg-amber-50/50"
            >
              <p className="font-medium text-sm">{c.raisonSociale}</p>
              <p className="text-xs text-gray-400">
                {c.ville} · RC {c.rc || '—'}
              </p>
            </button>
          ))}
          <button
            type="button"
            onClick={() => pickCompany(null)}
            className="text-left px-4 py-3 border border-dashed rounded-xl text-sm text-gray-500 hover:border-gray-400"
          >
            Continuer sans société enregistrée
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-56 border-r bg-gray-50 p-3 space-y-1 shrink-0 overflow-y-auto">
        {LEGAL_PROCEDURE_CATEGORIES.map((cat) => {
          const Icon = categoryIcons[cat] ?? FileText;
          const count = LEGAL_PROCEDURES.filter((p) => p.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs ${
                selectedCategory === cat ? 'bg-white shadow text-amber-700 font-medium' : 'text-gray-500 hover:bg-white/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={12} /> {cat}
              </span>
              <span className="text-gray-400">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="font-bold text-gray-800 mb-1">Formalités juridiques</h2>
        <p className="text-xs text-gray-400 mb-4">
          {LEGAL_PROCEDURES.length} procédures — génération IA, enregistrement Supabase, lien société + date.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => startProcedure(p)}
              className="text-left p-4 bg-white border rounded-xl hover:border-amber-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm text-gray-800">{p.name}</p>
                {p.stabilizing && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                    Stabilisation
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{p.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
