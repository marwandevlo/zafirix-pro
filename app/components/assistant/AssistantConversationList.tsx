'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Plus, Search } from 'lucide-react';
import type { AtlasAiConversation } from '@/app/types/atlas-ai-copilot';
import { useDebouncedValue } from '@/app/lib/use-debounced-value';

type Props = {
  companyId: string | null;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  refreshKey?: number;
};

export function AssistantConversationList({ companyId, activeId, onSelect, onNew, refreshKey }: Props) {
  const [conversations, setConversations] = useState<AtlasAiConversation[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const qs = params.toString() ? `?${params}` : '';
      const res = await fetch(`/api/assistant/conversations${qs}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) {
        if (!signal?.aborted) {
          setError('Impossible de charger les conversations.');
          setConversations([]);
        }
        return;
      }
      const data = (await res.json()) as { conversations?: AtlasAiConversation[] };
      if (!signal?.aborted) {
        setConversations(data.conversations ?? []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!signal?.aborted) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
        setConversations([]);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [companyId, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  return (
    <div className="flex flex-col h-full border-r bg-gray-50/80">
      <div className="p-3 border-b bg-white space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Conversations</h2>
          <button type="button" onClick={onNew} className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600" title="Nouvelle conversation">
            <Plus size={16} />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-8 pr-3 py-2 text-xs border rounded-lg"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <Loader2 className="animate-spin text-gray-400 mx-auto mt-4" size={18} />
        ) : error ? (
          <p className="text-xs text-red-500 p-2">{error}</p>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-gray-400 p-2">Aucune conversation</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors ${
                activeId === c.id ? 'bg-violet-100 border border-violet-200' : 'hover:bg-white border border-transparent'
              }`}
            >
              <p className="font-medium text-gray-800 truncate flex items-center gap-1">
                <MessageSquare size={12} className="shrink-0 text-violet-500" />
                {c.title}
              </p>
              {c.lastMessage && <p className="text-gray-500 mt-0.5 line-clamp-2">{c.lastMessage}</p>}
              <p className="text-[10px] text-gray-400 mt-1">{c.messageCount ?? 0} message(s)</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
