'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Loader2 } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import {
  ATLAS_AGENT_DEFINITIONS,
  agentDefinition,
  type AtlasAgentDefinition,
} from '@/app/lib/atlas-agents-config';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import type {
  AtlasAgentConversation,
  AtlasAgentMessage,
  AtlasAgentOverviewStats,
  AtlasAgentType,
} from '@/app/types/atlas-agent';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "À l'instant";
  if (diff < 3_600_000) return `Il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Il y a ${Math.floor(diff / 3_600_000)} h`;
  return new Date(iso).toLocaleDateString('fr-MA');
}

async function agentsFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export default function AgentsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stats, setStats] = useState<AtlasAgentOverviewStats | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadingOverview, setLoadingOverview] = useState(true);

  const [activeType, setActiveType] = useState<AtlasAgentType | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AtlasAgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const reloadOverview = useCallback(async () => {
    setLoadError('');
    setLoadingOverview(true);
    try {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      const q = cid ? `?companyId=${encodeURIComponent(cid)}` : '';
      const { ok, data } = await agentsFetch<{ stats?: AtlasAgentOverviewStats; error?: string }>(
        `/api/agents/stats${q}`,
      );
      if (!ok) {
        setStats(null);
        setLoadError(data.error ?? 'Impossible de charger les agents.');
        return;
      }
      setStats(data.stats ?? null);
    } catch {
      setLoadError('Erreur réseau.');
      setStats(null);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    void reloadOverview();
  }, [reloadOverview]);

  const statsFor = useCallback(
    (type: AtlasAgentType) => stats?.byType.find((s) => s.agentType === type),
    [stats],
  );

  const hasAnyActivity = (stats?.totalConversations ?? 0) > 0;

  const openChat = async (type: AtlasAgentType) => {
    setOpeningChat(true);
    setLoadError('');
    setActiveType(type);
    try {
      const q = new URLSearchParams({ agentType: type });
      if (companyId) q.set('companyId', companyId);

      const listRes = await agentsFetch<{ conversations?: AtlasAgentConversation[] }>(
        `/api/agents/conversations?${q}`,
      );
      let convId = listRes.data.conversations?.[0]?.id ?? null;

      if (!convId) {
        const createRes = await agentsFetch<{ conversation?: AtlasAgentConversation; error?: string }>(
          '/api/agents/conversations',
          {
            method: 'POST',
            body: JSON.stringify({ agentType: type, companyId }),
          },
        );
        if (!createRes.ok || !createRes.data.conversation) {
          setLoadError(createRes.data.error ?? 'Impossible de démarrer la conversation.');
          setActiveType(null);
          return;
        }
        convId = createRes.data.conversation.id;
      }

      setConversationId(convId);
      const msgRes = await agentsFetch<{ messages?: AtlasAgentMessage[] }>(
        `/api/agents/conversations/${convId}/messages`,
      );
      setMessages(msgRes.data.messages ?? []);
    } catch {
      setLoadError('Erreur réseau.');
      setActiveType(null);
    } finally {
      setOpeningChat(false);
    }
  };

  const closeChat = () => {
    setActiveType(null);
    setConversationId(null);
    setMessages([]);
    setInput('');
    void reloadOverview();
  };

  const sendMessage = async () => {
    if (!conversationId || !input.trim() || chatLoading) return;
    const text = input.trim();
    setInput('');
    setChatLoading(true);
    setLoadError('');

    const optimistic: AtlasAgentMessage = {
      id: `tmp-${Date.now()}`,
      conversationId,
      userId: '',
      role: 'user',
      content: text,
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const { ok, data } = await agentsFetch<{
        userMessage?: AtlasAgentMessage;
        assistantMessage?: AtlasAgentMessage;
        error?: string;
      }>(`/api/agents/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });

      if (!ok || !data.assistantMessage) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setLoadError(data.error ?? 'Échec de l’envoi.');
        return;
      }

      setMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        data.userMessage ?? optimistic,
        data.assistantMessage!,
      ]);
      void reloadOverview();
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setLoadError('Erreur réseau.');
    } finally {
      setChatLoading(false);
    }
  };

  const selected: AtlasAgentDefinition | null = activeType ? agentDefinition(activeType) : null;

  const globalTotals = useMemo(
    () => ({
      done: stats?.totalDone ?? 0,
      pending: stats?.totalPending ?? 0,
      failed: stats?.totalFailed ?? 0,
    }),
    [stats],
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />

      <main className="flex-1 flex overflow-hidden">
        <div className={`${activeType ? 'hidden lg:flex' : 'flex'} flex-col flex-1 overflow-hidden`}>
          <header className="bg-white border-b border-gray-200 px-8 py-4">
            <h1 className="text-xl font-bold text-gray-800">Agents IA</h1>
            <p className="text-xs text-gray-400 mt-0.5">Assistants spécialisés — historique et tâches enregistrés</p>
          </header>

          <div className="shrink-0 px-8 pt-3">
            <BetaSurfaceBadge label="Bêta · Agents IA" />
          </div>

          {loadError ? (
            <div className="mx-8 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {loadError}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {loadingOverview ? (
              <p className="text-sm text-gray-500 text-center py-12 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Chargement…
              </p>
            ) : !hasAnyActivity ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-8 py-16 text-center">
                <p className="text-lg font-semibold text-gray-700">Aucun agent lancé</p>
                <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                  Choisissez un agent ci-dessous et cliquez sur <strong>Discuter</strong> pour démarrer une conversation
                  enregistrée.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400">Tâches terminées</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{globalTotals.done}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400">En cours</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{globalTotals.pending}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400">Échecs</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{globalTotals.failed}</p>
                </div>
              </div>
            )}

            {ATLAS_AGENT_DEFINITIONS.map((agent) => {
              const typeStats = statsFor(agent.type);
              const convCount = typeStats?.conversationCount ?? 0;
              return (
                <AgentCard
                  key={agent.type}
                  agent={agent}
                  done={typeStats?.done ?? 0}
                  pending={typeStats?.pending ?? 0}
                  failed={typeStats?.failed ?? 0}
                  lastActivity={formatRelativeTime(typeStats?.lastActivityAt ?? null)}
                  hasConversations={convCount > 0}
                  onDiscuss={() => void openChat(agent.type)}
                  discussing={openingChat && activeType === agent.type}
                />
              );
            })}
          </div>
        </div>

        {activeType && selected && (
          <div className="flex flex-col flex-1 lg:max-w-md border-l border-gray-200 bg-white">
            <div className={`${selected.color} px-4 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <selected.icon size={20} className="text-white" />
                <div>
                  <p className="font-bold text-white text-sm">{selected.name}</p>
                  <p className="text-white/70 text-xs">{selected.role}</p>
                </div>
              </div>
              <button type="button" onClick={closeChat} className="text-white/70 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && !chatLoading && (
                <div className={`${selected.colorLight} rounded-xl p-4 text-sm ${selected.colorText}`}>
                  Bonjour — je suis {selected.name}. Posez votre question ; la conversation est enregistrée.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#1B2A4A] text-white'
                        : `${selected.colorLight} ${selected.colorText}`
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-1 p-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-3">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void sendMessage()}
                  placeholder={`Parlez à ${selected.name}…`}
                  disabled={chatLoading || !conversationId}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={chatLoading || !conversationId}
                  className={`px-3 py-2 ${selected.color} text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50`}
                >
                  →
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function AgentCard({
  agent,
  done,
  pending,
  failed,
  lastActivity,
  hasConversations,
  onDiscuss,
  discussing,
}: {
  agent: AtlasAgentDefinition;
  done: number;
  pending: number;
  failed: number;
  lastActivity: string;
  hasConversations: boolean;
  onDiscuss: () => void;
  discussing: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border ${hasConversations ? agent.colorBorder : 'border-gray-100'} overflow-hidden`}
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 ${agent.color} rounded-xl flex items-center justify-center shrink-0`}>
            <agent.icon size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-800">{agent.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{agent.role}</p>
            <p className="text-sm text-gray-600 mt-2">{agent.description}</p>
          </div>
        </div>

        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {agent.capabilities.map((cap) => (
            <li key={cap} className="text-xs text-gray-500">
              · {cap}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="text-green-600 font-medium">{done} terminées</span>
            <span className="text-amber-600 font-medium">{pending} en cours</span>
            {failed > 0 ? <span className="text-red-600 font-medium">{failed} échec(s)</span> : null}
            <span>{lastActivity}</span>
          </div>
          <button
            type="button"
            onClick={onDiscuss}
            disabled={discussing}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${agent.colorLight} ${agent.colorText} hover:opacity-80 disabled:opacity-50`}
          >
            {discussing ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
            Discuter
          </button>
        </div>
      </div>
    </div>
  );
}
