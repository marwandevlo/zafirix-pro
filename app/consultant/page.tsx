'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Loader2, Send, Sparkles, User } from 'lucide-react';
import { fetchAi } from '../lib/fetch-ai';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import type { AtlasCompany } from '@/app/types/atlas-company';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Quelles sont les échéances TVA mensuelles au Maroc ?',
  'Rappel barème IS 2026 pour une SARL',
  'Comment déclarer la CNSS pour un nouvel embauché ?',
  'Différence TVA 20% vs 14% : quels secteurs ?',
  'Obligations comptables minimales pour une petite SARL',
];

function formatCompanyContext(c: Partial<AtlasCompany>): string {
  const parts = [
    c.raisonSociale && `Raison sociale: ${c.raisonSociale}`,
    c.formeJuridique && `Forme: ${c.formeJuridique}`,
    c.if_fiscal && `IF: ${c.if_fiscal}`,
    c.ice && `ICE: ${c.ice}`,
    c.regimeTVA && `Régime TVA: ${c.regimeTVA}`,
    c.ville && `Ville: ${c.ville}`,
  ].filter(Boolean);
  return parts.length ? `\n\n[Contexte société enregistrée]\n${parts.join('\n')}` : '';
}

async function loadCompanyContext(): Promise<string> {
  const { getActiveAtlasCompany } = await import('@/app/lib/atlas-active-company');
  const { isAtlasSupabaseDataEnabled } = await import('@/app/lib/atlas-data-source');
  const { readActiveCompanyFromLocalStorage } = await import('@/app/lib/atlas-companies-repository');
  try {
    if (isAtlasSupabaseDataEnabled()) {
      const active = await getActiveAtlasCompany();
      if (!active) return '';
      return formatCompanyContext(active);
    }
    const partial = readActiveCompanyFromLocalStorage();
    if (!partial) return '';
    return formatCompanyContext(partial);
  } catch {
    return '';
  }
}

export default function ConsultantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Bonjour — je suis votre **Consultant IA** ZAFIRIX PRO.\n\n" +
        "Posez vos questions sur la **fiscalité marocaine** (TVA, IS, IR, CNSS), les **échéances DGI**, ou la **gestion d'entreprise**. " +
        "Je m'appuie sur le cadre général marocain ; pour une décision engageante, validez toujours avec votre expert-comptable ou votre juriste.\n\n" +
        "Les **actes juridiques** (statuts, PV, dépôt légal) sont disponibles dans **Juridique**.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const context = await loadCompanyContext();
    const userMessage = trimmed + (context && !trimmed.includes('Contexte société') ? context : '');

    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetchAi({
        type: 'consultant',
        message: userMessage,
      });
      const data = (await res.json().catch(() => ({}))) as { response?: string; error?: string };

      if (res.status === 401) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content:
              data.error ??
              'Vous devez être connecté pour utiliser le Consultant IA. Utilisez **Connexion** depuis le menu ou `/login`.',
          },
        ]);
        return;
      }

      if (res.status === 429) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: data.error ?? 'Trop de requêtes. Patientez un moment puis réessayez.',
          },
        ]);
        return;
      }

      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: data.error ?? 'Une erreur est survenue. Réessayez plus tard.' },
        ]);
        return;
      }

      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.response ?? '(Réponse vide)' },
      ]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Erreur réseau. Vérifiez votre connexion.' }]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar
        variant="module"
        footer={
          <div className="px-4 py-3 border-t border-white/10">
            <p className="text-white/30 text-xs leading-relaxed">
              Conseil fiscal & social — Maroc. Pas un substitut à une mission d’expert-comptable.
            </p>
          </div>
        }
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Sparkles className="text-indigo-600" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Consultant IA</h1>
              <BetaSurfaceBadge label="Bêta · Fiscalité, TVA, IS, CNSS" className="mt-2 border-amber-100" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <Brain size={16} className="text-indigo-600" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#1B2A4A] text-white rounded-br-md'
                    : 'bg-white border border-gray-100 text-gray-700 shadow-sm rounded-bl-md'
                }`}
              >
                {msg.content.replace(/\*\*(.*?)\*\*/g, '$1')}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                  <User size={16} className="text-gray-600" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Loader2 className="text-indigo-600 animate-spin" size={16} />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-400">
                Analyse en cours…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-gray-200 bg-white px-6 py-3 shrink-0">
          <p className="text-xs text-gray-400 mb-2">Suggestions</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => send(s)}
                className="text-left text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors disabled:opacity-50 max-w-full truncate"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
              placeholder="Votre question fiscalité / social / entreprise…"
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              disabled={loading}
            />
            <button
              type="button"
              disabled={loading || !input.trim()}
              onClick={() => send(input)}
              className="shrink-0 flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
