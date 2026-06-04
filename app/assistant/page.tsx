'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain, Download, Loader2, Send, Sparkles, User, AlertTriangle,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { FiscalClosingAssistant } from '@/app/components/assistant/FiscalClosingAssistant';
import { AiActionBar } from '@/app/components/assistant/AiActionBar';
import { AssistantConversationList } from '@/app/components/assistant/AssistantConversationList';
import { AssistantSourcesPanel } from '@/app/components/assistant/AssistantSourcesPanel';
import { AssistantSuggestedQuestions } from '@/app/components/assistant/AssistantSuggestedQuestions';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import type { AiSourceRef, AtlasAiAnomaly } from '@/app/types/atlas-ai-copilot';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: AiSourceRef[];
  confidence?: number;
};

const WELCOME: Message = {
  role: 'assistant',
  content:
    'Bonjour — je suis votre Assistant IA Expert-Comptable & Fiscal.\n\n' +
    'Je m\'appuie sur vos données réelles Atlas (factures, comptabilité, TVA, paie, banque, liasse). ' +
    'Chaque réponse cite les sources utilisées — je n\'invente pas de chiffres.\n\n' +
    'Posez une question ou choisissez une suggestion.',
};

const ANOMALY_COLS: ExportColumn[] = [
  { key: 'category', label: 'Catégorie' },
  { key: 'severity', label: 'Sévérité' },
  { key: 'title', label: 'Titre' },
  { key: 'description', label: 'Description' },
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<AtlasAiAnomaly[]>([]);
  const [lastSources, setLastSources] = useState<AiSourceRef[]>([]);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [convRefreshKey, setConvRefreshKey] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const loadAnomalies = useCallback(async (cid: string | null) => {
    const qs = cid ? `?companyId=${encodeURIComponent(cid)}` : '';
    const res = await fetch(`/api/assistant/anomalies${qs}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json() as { anomalies?: AtlasAiAnomaly[] };
      setAnomalies(data.anomalies ?? []);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (!isAtlasSupabaseDataEnabled()) return;
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      await loadAnomalies(cid);
    })();
  }, [loadAnomalies]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const openConversation = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as {
        messages?: Array<{ role: 'user' | 'assistant'; content: string; sources?: AiSourceRef[] }>;
        conversation?: { id: string };
      };
      setConversationId(data.conversation?.id ?? id);
      const restored: Message[] = [WELCOME];
      for (const m of data.messages ?? []) {
        restored.push({ role: m.role, content: m.content, sources: m.sources });
      }
      setMessages(restored);
      const lastAssistant = [...(data.messages ?? [])].reverse().find((m) => m.role === 'assistant');
      setLastSources(lastAssistant?.sources ?? []);
    } finally {
      setLoading(false);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([WELCOME]);
    setLastSources([]);
    setLastConfidence(null);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, companyId, conversationId }),
      });
      const data = await res.json() as {
        answer?: string;
        error?: string;
        conversationId?: string;
        sources?: AiSourceRef[];
        confidence?: number;
      };
      if (data.conversationId) setConversationId(data.conversationId);
      const sources = data.sources ?? [];
      const confidence = data.confidence ?? null;
      setLastSources(sources);
      setLastConfidence(confidence);
      setConvRefreshKey((k) => k + 1);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: data.answer ?? data.error ?? 'Réponse indisponible',
          sources,
          confidence: confidence ?? undefined,
        },
      ]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Erreur réseau.' }]);
    } finally {
      setLoading(false);
    }
  };

  const exportAnomalies = anomalies.map((a) => ({
    category: a.category,
    severity: a.severity,
    title: a.title,
    description: a.description,
  }));

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
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <Sparkles className="text-violet-600" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Assistant IA</h1>
              <BetaSurfaceBadge label="Expert-Comptable · Fiscal · Audit" className="mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu
              data={exportAnomalies}
              columns={ANOMALY_COLS}
              filename="anomalies-ia"
              title="Rapport anomalies IA"
              formats={['csv', 'xlsx', 'json', 'pdf']}
              size="sm"
            />
            <button
              type="button"
              onClick={() => window.open(`/api/assistant/audit${companyId ? `?companyId=${companyId}&` : '?'}download=1`, '_blank')}
              className="flex items-center gap-1 px-3 py-2 text-xs border rounded-lg"
            >
              <Download size={14} /> Audit JSON
            </button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          <aside className="w-56 shrink-0 hidden xl:flex flex-col min-h-0">
            <AssistantConversationList
              companyId={companyId}
              activeId={conversationId}
              onSelect={(id) => id && void openConversation(id)}
              onNew={startNewConversation}
              refreshKey={convRefreshKey}
            />
          </aside>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 py-2 border-b bg-white">
              <AiActionBar companyId={companyId} contextLabel="Actions contextuelles" />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <Brain size={16} className="text-violet-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      msg.role === 'user' ? 'bg-[#1B2A4A] text-white' : 'bg-white border text-gray-700 shadow-sm'
                    }`}
                  >
                    {msg.content.replace(/\*\*(.*?)\*\*/g, '$1')}
                    {msg.confidence != null && msg.role === 'assistant' && (
                      <p className="text-[10px] text-gray-400 mt-2">Confiance: {Math.round(msg.confidence * 100)}%</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                      <User size={16} />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <Loader2 className="animate-spin text-violet-500" size={20} />
                  <span className="text-sm text-gray-400">Analyse des données Atlas…</span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="p-4 border-t bg-white">
              <AssistantSuggestedQuestions onSelect={(q) => void send(q)} disabled={loading} />
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send(input)}
                  placeholder="Question comptable, fiscale ou audit…"
                  className="flex-1 border rounded-xl px-4 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2.5 bg-violet-600 text-white rounded-xl disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>

          <aside className="w-80 border-l bg-white overflow-y-auto p-4 space-y-4 hidden lg:block">
            <AssistantSourcesPanel sources={lastSources} confidence={lastConfidence} />
            <FiscalClosingAssistant />
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1 mb-2">
                <AlertTriangle size={12} /> Anomalies ({anomalies.length})
              </h3>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {anomalies.slice(0, 8).map((a) => (
                  <li key={a.id} className="text-xs p-2 rounded-lg bg-gray-50 border">
                    <span className="font-medium text-gray-800">{a.title}</span>
                    <p className="text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>
                  </li>
                ))}
                {anomalies.length === 0 && <p className="text-xs text-gray-400">Aucune anomalie ouverte</p>}
              </ul>
              <button
                type="button"
                onClick={() => void loadAnomalies(companyId)}
                className="mt-2 text-xs text-violet-600 hover:underline"
              >
                Actualiser détection
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
