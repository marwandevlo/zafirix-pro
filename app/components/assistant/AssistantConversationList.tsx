'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Plus, Search } from 'lucide-react';
import type { AtlasAiConversation } from '@/app/types/atlas-ai-copilot';

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString() ? `?${params}` : '';
      const res = await fetch(`/api/assistant/conversations${qs}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { conversations?: AtlasAiConversation[] };
      setConversations(data.conversations ?? []);
    } finally {
      setLoading(false);
    }
  }, [companyId, search]);

  useEffect(() => {
    void load();
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
