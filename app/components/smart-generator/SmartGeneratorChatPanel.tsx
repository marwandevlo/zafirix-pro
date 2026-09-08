'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Save,
  Send,
  Sparkles,
  User,
  Wand2,
  X,
} from 'lucide-react';
import { companyToHeader } from '@/app/components/smart-generator/SmartGeneratorLegalHeaderPanel';
import {
  parseSmartGeneratorChatResponse,
  splitSmartGeneratorStreamBuffer,
} from '@/app/lib/atlas-smart-generator-chat-server';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type { SmartGeneratorDocument, SmartGeneratorHeader } from '@/app/types/atlas-smart-generator';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachmentName?: string;
};

type PendingAttachment = {
  file: File;
  previewUrl: string | null;
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ACCEPT_ATTACHMENTS = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,application/pdf,text/plain,image/png,image/jpeg';

const STARTERS = [
  'Génère une facture pour prestations comptables — 5000 MAD HT, TVA 20%',
  'Crée un devis pour 3 postes : audit, conseil, formation',
  'Digitalise cette facture scannée et formate-la officiellement',
  'Change la quantité du 2e article à 10 et recalcule les totaux',
  'Ajoute les mentions ICE/IF/RC de ma société en en-tête',
];

function isAllowedChatFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (/\.(pdf|docx?|txt|png|jpe?g)$/i.test(lower)) return true;
  return [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
  ].includes(file.type);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('read_failed'));
        return;
      }
      const base64 = result.includes(',') ? result.split(',')[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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

async function consumeSmartGeneratorChatStream(
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
  companies: AtlasCompany[];
  selectedCompanyId: string | null;
  onSelectCompany: (id: string | null, company: AtlasCompany | null) => void;
  companyHeader: SmartGeneratorHeader;
};

export function SmartGeneratorChatPanel({
  companies,
  selectedCompanyId,
  onSelectCompany,
  companyHeader,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Bonjour — je suis votre **Smart Generator IA**. Décrivez librement le document souhaité (facture, devis, bon de commande, reçu, bulletin, lettre…) ou joignez une note/scan à digitaliser. Le document se met à jour en direct à droite.\n\n💡 Exemples : « Change la TVA à 14% », « Ajoute une ligne transport 800 MAD », « Passe en arabe ».',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [documentDraft, setDocumentDraft] = useState('');
  const [documentTitle, setDocumentTitle] = useState('Document');
  const [structuredDoc, setStructuredDoc] = useState<SmartGeneratorDocument | null>(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [streamingReply, setStreamingReply] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachError, setAttachError] = useState('');

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    };
  }, [pendingAttachment?.previewUrl]);

  const clearAttachment = useCallback(() => {
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setAttachError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleFileSelect = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      setAttachError('');

      if (!isAllowedChatFile(file)) {
        setAttachError('Formats: PDF, Word, TXT, PNG, JPG.');
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachError('Fichier max 10 Mo.');
        return;
      }

      clearAttachment();
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setPendingAttachment({ file, previewUrl });
    },
    [clearAttachment],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingReply]);

  const sendMessage = useCallback(
    async (text: string, attachmentOverride?: PendingAttachment | null) => {
      const trimmed = text.trim();
      const attachment = attachmentOverride ?? pendingAttachment;
      if ((!trimmed && !attachment) || loading) return;

      const displayText = trimmed || `📎 ${attachment?.file.name ?? 'Pièce jointe'}`;

      const userMsg: ChatMessage = {
        role: 'user',
        content: displayText,
        attachmentName: attachment?.file.name,
      };
      setMessages((m) => [...m, userMsg]);
      setInput('');
      setLoading(true);
      setStreamingReply('');
      setSaveStatus('');
      setExportStatus('');
      setAttachError('');

      let attachmentPayload: { filename: string; mimeType: string; base64: string } | undefined;
      if (attachment) {
        try {
          attachmentPayload = {
            filename: attachment.file.name,
            mimeType: attachment.file.type || 'application/octet-stream',
            base64: await fileToBase64(attachment.file),
          };
        } catch {
          setMessages((m) => [...m, { role: 'assistant', content: 'Impossible de lire le fichier.' }]);
          setLoading(false);
          return;
        }
        clearAttachment();
      }

      const apiMessage =
        trimmed ||
        'Analyse la pièce jointe et génère ou mets à jour le document commercial correspondant.';

      try {
        const res = await fetch('/api/smart-generator/chat?stream=1', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: apiMessage,
            history: messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
            documentDraft,
            documentTitle,
            companyHeader,
            stream: true,
            attachment: attachmentPayload ?? null,
          }),
        });

        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: json.message ?? json.error ?? 'Erreur IA.' },
          ]);
          return;
        }

        const full = await consumeSmartGeneratorChatStream(res, (buf) => {
          const { reply, document } = splitSmartGeneratorStreamBuffer(buf);
          setStreamingReply(reply);
          if (document.trim()) setDocumentDraft(document);
        });

        const parsed = parseSmartGeneratorChatResponse(full, documentTitle);
        const finalReply = parsed.reply.trim() || 'Document mis à jour.';
        if (parsed.document.trim()) setDocumentDraft(parsed.document);
        if (parsed.documentTitle) setDocumentTitle(parsed.documentTitle);
        if (parsed.structured) setStructuredDoc(parsed.structured);

        setMessages((m) => [...m, { role: 'assistant', content: finalReply }]);
        setStreamingReply('');
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: err instanceof Error ? err.message : 'Erreur réseau.',
          },
        ]);
        setStreamingReply('');
      } finally {
        setLoading(false);
      }
    },
    [clearAttachment, companyHeader, documentDraft, documentTitle, loading, messages, pendingAttachment],
  );

  const copyDocument = async () => {
    if (!documentDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(documentDraft);
      setCopyStatus('Copié !');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('Échec copie');
    }
  };

  const exportDocument = async (format: 'pdf' | 'excel') => {
    if (!structuredDoc?.lines?.length) {
      setExportStatus('Export PDF/Excel nécessite un document tabulaire structuré.');
      return;
    }
    setExportStatus('Export…');
    try {
      const res = await fetch('/api/smart-generator/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          structured: structuredDoc,
          companyId: selectedCompanyId,
          companyHeader,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; filename?: string; base64?: string; mimeType?: string; message?: string; error?: string };
      if (!res.ok || !data.base64 || !data.filename) {
        setExportStatus(data.message ?? data.error ?? 'Export échoué.');
        return;
      }
      downloadBase64(data.base64, data.filename, data.mimeType ?? 'application/octet-stream');
      setExportStatus(format === 'pdf' ? 'PDF téléchargé.' : 'Excel téléchargé.');
      setTimeout(() => setExportStatus(''), 2500);
    } catch {
      setExportStatus('Erreur export.');
    }
  };

  const saveToRepository = async () => {
    if (!documentDraft.trim()) {
      setSaveStatus('Aucun document à enregistrer.');
      return;
    }
    if (!selectedCompanyId) {
      setSaveStatus('Sélectionnez une société pour enregistrer.');
      return;
    }
    setSaveStatus('Enregistrement…');
    try {
      const res = await fetch('/api/smart-generator/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          structured: structuredDoc,
          documentText: documentDraft,
          documentTitle,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setSaveStatus(data.message ?? data.error ?? 'Échec enregistrement.');
        return;
      }
      setSaveStatus(data.message ?? 'Enregistré dans la plateforme.');
    } catch {
      setSaveStatus('Erreur réseau.');
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <MessageSquare className="text-indigo-600" size={20} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Smart Generator IA</h2>
              <p className="text-xs text-gray-500">Conversation · documents dynamiques · DGI Maroc</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <select
              value={selectedCompanyId ?? ''}
              onChange={(e) => {
                const id = e.target.value || null;
                const company = id
                  ? companies.find((c) => (c.dbRowId ?? String(c.id)) === id) ?? null
                  : null;
                onSelectCompany(id, company);
              }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 max-w-xs"
            >
              <option value="">Sans société / en-tête manuel</option>
              {companies.map((c) => (
                <option key={c.dbRowId ?? String(c.id)} value={c.dbRowId ?? String(c.id)}>
                  {c.raisonSociale}
                </option>
              ))}
            </select>
            <input
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]"
              placeholder="Titre du document"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-50 border border-gray-100 text-gray-800'
                }`}
              >
                {m.content}
                {m.attachmentName ? (
                  <p className="mt-2 text-[11px] opacity-80 flex items-center gap-1">
                    <Paperclip size={11} /> {m.attachmentName}
                  </p>
                ) : null}
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
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-white animate-pulse" />
              </div>
              <div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm bg-gray-50 border border-indigo-100 text-gray-800 whitespace-pre-wrap">
                {streamingReply}
              </div>
            </div>
          ) : null}

          {loading && !streamingReply ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 px-2">
              <Loader2 size={14} className="animate-spin" /> Génération…
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {!loading && messages.length <= 1 ? (
          <div className="px-5 pb-2 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void sendMessage(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div className="border-t border-gray-100 p-4 shrink-0 space-y-2">
          {pendingAttachment ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/80">
              {pendingAttachment.previewUrl ? (
                <img
                  src={pendingAttachment.previewUrl}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover border border-indigo-200 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white border border-indigo-200 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-indigo-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{pendingAttachment.file.name}</p>
                <p className="text-[10px] text-gray-500">{formatFileSize(pendingAttachment.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-gray-800"
                aria-label="Retirer la pièce jointe"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          {attachError ? <p className="text-xs text-red-600 px-1">{attachError}</p> : null}
          <div className="flex gap-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTACHMENTS}
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-indigo-600 disabled:opacity-50 shrink-0"
              title="Joindre PDF, Word, TXT ou image"
              aria-label="Joindre un fichier"
            >
              <Paperclip size={18} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                !e.shiftKey &&
                (e.preventDefault(), void sendMessage(input))
              }
              placeholder="Décrivez ou modifiez votre document…"
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={loading || (!input.trim() && !pendingAttachment)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors shrink-0"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Live document panel */}
      <div className="flex flex-col w-full lg:w-[min(48%,520px)] shrink-0 bg-gray-50">
        <div className="px-5 py-4 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{documentTitle}</h3>
            <p className="text-[11px] text-gray-500">Aperçu live · mise à jour à chaque message</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void copyDocument()}
              disabled={!documentDraft.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <Copy size={12} /> {copyStatus || 'Copier'}
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
              onClick={() => void exportDocument('pdf')}
              disabled={!structuredDoc?.lines?.length}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <FileText size={12} className="text-red-600" /> PDF
            </button>
            <button
              type="button"
              onClick={() => void exportDocument('excel')}
              disabled={!structuredDoc?.lines?.length}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <FileSpreadsheet size={12} className="text-emerald-600" /> Excel
            </button>
            <button
              type="button"
              onClick={() => void saveToRepository()}
              disabled={!documentDraft.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              <Save size={12} /> Enregistrer
            </button>
          </div>
        </div>

        {(saveStatus || exportStatus) ? (
          <p className="text-xs px-5 py-2 bg-emerald-50 text-emerald-800 border-b border-emerald-100">
            {saveStatus || exportStatus}
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto p-5">
          {documentDraft.trim() ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-mono min-h-[200px] shadow-sm">
              {documentDraft}
              {loading ? (
                <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
              ) : null}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 text-sm">
              <Wand2 size={28} className="mx-auto mb-3 opacity-40 text-indigo-400" />
              <p>Le document apparaîtra ici au fil de la conversation.</p>
              <p className="text-xs mt-2 text-gray-300">Factures · Devis · Bons · Reçus · Paie · Lettres · Custom</p>
            </div>
          )}
        </div>

        <p className="text-[10px] text-indigo-800 bg-indigo-50 border-t border-indigo-100 px-5 py-2 shrink-0">
          Conformité DGI Maroc (TVA 0/7/10/14/20%, PCGE) — vérifiez les montants avant émission officielle.
        </p>
      </div>
    </div>
  );
}
