'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Copy,
  Download,
  Loader2,
  MessageSquare,
  Save,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { persistLegalDocument } from '@/app/juridique/juridique-persist';
import { splitJuridiqueStreamBuffer } from '@/app/lib/atlas-juridique-chat-server';
import type { JuridiqueUiLocale } from '@/app/types/atlas-juridique-categories';
import { juridiqueLabel } from '@/app/types/atlas-juridique-categories';

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

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const STARTERS_FR = [
  'Rédige un contrat de bail commercial pour un local à Casablanca',
  'Prépare un PV d\'assemblée générale ordinaire pour approbation des comptes',
  'Ajoute une clause de confidentialité au document',
  'Modifie le montant du capital à 200 000 MAD',
];

const STARTERS_AR = [
  'أعد مسودة عقد كراء تجاري في الدار البيضاء',
  'حضّر محضر جمعية عامة عادية لاعتماد الحسابات',
  'أضف بند السرية إلى الوثيقة',
  'غيّر مبلغ رأس المال إلى 200000 درهم',
];

async function consumeJuridiqueChatStream(
  response: Response,
  onChunk: (buffer: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('stream_unavailable');

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as { text?: string; error?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) {
          full += parsed.text;
          onChunk(full);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  return full;
}

async function downloadWord(content: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const paragraphs = content.split('\n').map((line) =>
    new Paragraph({ children: [new TextRun({ text: line.trim(), size: 20 })], spacing: { after: 80 } }),
  );
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  companies: Company[];
  lang?: JuridiqueUiLocale;
};

export function JuridiqueLegalChatPanel({ companies, lang = 'fr' }: Props) {
  const t = (fr: string, ar: string) => juridiqueLabel(lang, fr, ar);
  const starters = lang === 'ar' ? STARTERS_AR : STARTERS_FR;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: t(
        'Bonjour — je suis votre **Assistant Juridique IA**. Décrivez le document souhaité ou demandez des modifications (« Change le prix à 200k », « Ajoute une clause de confidentialité », « Réécris l\'article 3 »). Le brouillon se met à jour en direct à droite.\n\n⚠️ Texte généré — validation par juriste/notaire obligatoire avant usage officiel.',
        'مرحباً — أنا **مساعدك القانوني بالذكاء الاصطناعي**. صِف الوثيقة المطلوبة أو اطلب تعديلات (« غيّر السعر إلى 200 ألف »، « أضف بند السرية »). المسودة تتحدّث مباشرة على اليمين.\n\n⚠️ نص مُولَّد — يجب التحقق من محامٍ أو موثق قبل الاستخدام الرسمي.',
      ),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [documentDraft, setDocumentDraft] = useState('');
  const [documentTitle, setDocumentTitle] = useState(t('Document juridique', 'وثيقة قانونية'));
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | ''>('');
  const [saveStatus, setSaveStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [streamingReply, setStreamingReply] = useState('');

  const endRef = useRef<HTMLDivElement>(null);
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingReply]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      setMessages((m) => [...m, userMsg]);
      setInput('');
      setLoading(true);
      setStreamingReply('');
      setSaveStatus('');

      try {
        const res = await fetch('/api/juridique/chat?stream=1', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
            documentDraft,
            documentTitle,
            company: selectedCompany,
            stream: true,
          }),
        });

        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: json.error ?? t('Erreur IA.', 'خطأ في الذكاء الاصطناعي.') },
          ]);
          return;
        }

        const full = await consumeJuridiqueChatStream(res, (buf) => {
          const { reply, document } = splitJuridiqueStreamBuffer(buf);
          setStreamingReply(reply);
          if (document.trim()) setDocumentDraft(document);
        });

        const { reply, document } = splitJuridiqueStreamBuffer(full);
        const finalReply = reply.trim() || t('Document mis à jour.', 'تم تحديث الوثيقة.');
        if (document.trim()) setDocumentDraft(document);

        setMessages((m) => [...m, { role: 'assistant', content: finalReply }]);
        setStreamingReply('');
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: err instanceof Error ? err.message : t('Erreur réseau.', 'خطأ في الشبكة.'),
          },
        ]);
        setStreamingReply('');
      } finally {
        setLoading(false);
      }
    },
    [documentDraft, documentTitle, loading, messages, selectedCompany, t],
  );

  const copyDocument = async () => {
    if (!documentDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(documentDraft);
      setCopyStatus(t('Copié !', 'تم النسخ!'));
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus(t('Échec copie', 'فشل النسخ'));
    }
  };

  const saveToRepository = async () => {
    if (!documentDraft.trim()) {
      setSaveStatus(t('Aucun document à enregistrer.', 'لا توجد وثيقة للحفظ.'));
      return;
    }
    setSaveStatus(t('Enregistrement…', 'جاري الحفظ…'));
    const saved = await persistLegalDocument({
      company: selectedCompany,
      procedureId: 'juridique_chat_draft',
      procedureLabel: documentTitle,
      content: documentDraft,
      formData: { source: 'legal_chat_assistant' },
      linkSource: 'juridique_chat',
    });
    if (saved.ok) {
      setSaveStatus(
        t(
          `Enregistré dans le coffre juridique (réf. ${saved.id.slice(0, 8)}…).`,
          `تم الحفظ في الخزنة القانونية (${saved.id.slice(0, 8)}…).`,
        ),
      );
    } else {
      setSaveStatus(t('Échec enregistrement.', 'فشل الحفظ.'));
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <MessageSquare className="text-amber-700" size={20} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">
                {t('Assistant Juridique IA', 'المساعد القانوني الذكي')}
              </h2>
              <p className="text-xs text-gray-500">
                {t('Conversation · révisions en direct', 'محادثة · تعديلات مباشرة')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : '')}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 max-w-xs"
            >
              <option value="">{t('Sans société liée', 'بدون شركة')}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.raisonSociale}
                </option>
              ))}
            </select>
            <input
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]"
              placeholder={t('Titre du document', 'عنوان الوثيقة')}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'bg-gray-50 border border-gray-100 text-gray-800'
                }`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <User size={16} className="text-gray-600" />
                </div>
              )}
            </div>
          ))}

          {loading && streamingReply ? (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-white animate-pulse" />
              </div>
              <div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm bg-gray-50 border border-amber-100 text-gray-800 whitespace-pre-wrap">
                {streamingReply}
              </div>
            </div>
          ) : null}

          {loading && !streamingReply ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 px-2">
              <Loader2 size={14} className="animate-spin" /> {t('Rédaction…', 'جاري الكتابة…')}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {!loading && messages.length <= 1 ? (
          <div className="px-5 pb-2 flex flex-wrap gap-2">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void sendMessage(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div className="border-t border-gray-100 p-4 flex gap-2 shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void sendMessage(input))}
            placeholder={t('Votre instruction juridique…', 'تعليماتك القانونية…')}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-amber-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-amber-500 text-white disabled:opacity-50 hover:bg-amber-600 transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      {/* Live document panel */}
      <div className="flex flex-col w-full lg:w-[min(48%,520px)] shrink-0 bg-gray-50">
        <div className="px-5 py-4 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{documentTitle}</h3>
            <p className="text-[11px] text-gray-500">
              {t('Brouillon live · mise à jour à chaque message', 'مسودة مباشرة · تحديث مع كل رسالة')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void copyDocument()}
              disabled={!documentDraft.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <Copy size={12} /> {copyStatus || t('Copier', 'نسخ')}
            </button>
            <button
              type="button"
              onClick={() => void downloadWord(documentDraft, documentTitle.replace(/\s+/g, '_'))}
              disabled={!documentDraft.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <Download size={12} /> Word
            </button>
            <button
              type="button"
              onClick={() => void saveToRepository()}
              disabled={!documentDraft.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#1B2A4A] text-white hover:bg-[#1a3060] disabled:opacity-40"
            >
              <Save size={12} /> {t('Enregistrer', 'حفظ')}
            </button>
          </div>
        </div>

        {saveStatus ? (
          <p className="text-xs px-5 py-2 bg-emerald-50 text-emerald-800 border-b border-emerald-100">{saveStatus}</p>
        ) : null}

        <div className="flex-1 overflow-y-auto p-5">
          {documentDraft.trim() ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-mono min-h-[200px]">
              {documentDraft}
              {loading ? <span className="inline-block w-2 h-4 bg-amber-400 animate-pulse ml-0.5 align-middle" /> : null}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 text-sm">
              <Sparkles size={28} className="mx-auto mb-3 opacity-40" />
              <p>{t('Le document apparaîtra ici au fil de la conversation.', 'ستظهر الوثيقة هنا أثناء المحادثة.')}</p>
            </div>
          )}
        </div>

        <p className="text-[10px] text-amber-800 bg-amber-50 border-t border-amber-100 px-5 py-2 shrink-0">
          {t(
            'Conformité MA (RC, IF, ICE) — validation professionnelle requise avant dépôt ou signature.',
            'امتثال مغربي (RC، IF، ICE) — التحقق المهني مطلوب قبل الإيداع أو التوقيع.',
          )}
        </p>
      </div>
    </div>
  );
}
