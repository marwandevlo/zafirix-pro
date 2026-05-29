'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Mic, Send, X, Volume2, Bot, Loader2 } from 'lucide-react';
import { fetchAi } from '@/app/lib/fetch-ai';
import type { AtlasAssistantAction, AtlasAssistantResponse } from '@/app/components/assistant/assistant-types';
import { executeAssistantAction } from '@/app/lib/assistant-executor';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';

type Msg = { role: 'user' | 'assistant'; content: string };

async function whisperTranscribe(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append('audio', blob, 'audio.webm');
  const res = await fetch('/api/whisper', { method: 'POST', credentials: 'include', body: fd });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Transcription failed');
  return data.text ?? '';
}

async function ttsSpeak(text: string): Promise<void> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return;
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(() => {});
}

function normalizeAssistantPayload(payload: unknown): AtlasAssistantResponse {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    const response = typeof p.response === 'string' ? p.response : '';
    const actionsRaw = Array.isArray(p.actions) ? p.actions : [];
    const actions: AtlasAssistantAction[] = actionsRaw
      .map((a: unknown) => {
        if (!a || typeof a !== 'object') return null;
        const act = a as Record<string, unknown>;
        const action = typeof act.action === 'string' ? act.action : '';
        if (!action) return null;
        const data = act.data && typeof act.data === 'object' ? (act.data as Record<string, unknown>) : undefined;
        const confidence = typeof act.confidence === 'number' ? act.confidence : undefined;
        const requiresConfirmation = typeof act.requiresConfirmation === 'boolean' ? act.requiresConfirmation : true;
        return { action, data, confidence, requiresConfirmation } satisfies AtlasAssistantAction;
      })
      .filter(Boolean) as AtlasAssistantAction[];
    return { response, actions };
  }
  return { response: '', actions: [] };
}

export function AssistantOverlay() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Assistant ZAFIRIX PRO prêt. Décrivez ce que vous voulez faire (facture, paiement, recherche, RH, documents).' },
  ]);
  const [actions, setActions] = useState<AtlasAssistantAction[]>([]);
  const [actionStatus, setActionStatus] = useState<Record<number, { state: 'pending' | 'running' | 'done' | 'error'; message?: string }>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const canRecord = useMemo(() => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetchAi({ type: 'assistant', message: trimmed });
      const payload = (await res.json().catch(() => ({}))) as AtlasAssistantResponse & { error?: string };
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: payload.error ?? 'Erreur assistant.' }]);
        return;
      }
      const normalized = normalizeAssistantPayload(payload);
      setMessages((m) => [...m, { role: 'assistant', content: normalized.response || '(Réponse vide)' }]);
      if (normalized.actions.length) setActions((a) => [...normalized.actions, ...a]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Erreur réseau assistant.' }]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const startRecording = useCallback(async () => {
    if (!canRecord || recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      try {
        setLoading(true);
        const text = await whisperTranscribe(blob);
        if (text.trim()) await send(text);
      } finally {
        setLoading(false);
        setRecording(false);
      }
    };
    mediaRecorderRef.current = rec;
    rec.start();
    setRecording(true);
  }, [canRecord, recording, send]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    rec.stop();
  }, []);

  const confirmAction = useCallback(async (idx: number) => {
    const action = actions[idx];
    if (!action) return;
    setActionStatus((s) => ({ ...s, [idx]: { state: 'running' } }));
    const res = await executeAssistantAction(action);
    if (res.ok) {
      setActionStatus((s) => ({ ...s, [idx]: { state: 'done', message: res.message } }));
      return;
    }
    setActionStatus((s) => ({ ...s, [idx]: { state: 'error', message: res.error } }));
  }, [actions]);

  const cancelAction = useCallback((idx: number) => {
    setActions((a) => a.filter((_, i) => i !== idx));
    setActionStatus((s) => {
      const next: typeof s = {};
      for (const [k, v] of Object.entries(s)) {
        const n = Number(k);
        if (n < idx) next[n] = v;
        if (n > idx) next[n - 1] = v;
      }
      return next;
    });
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-60 w-14 h-14 rounded-2xl bg-[#0F1F3D] text-white shadow-xl hover:bg-[#1a3060] transition-colors flex items-center justify-center"
        aria-label="Ouvrir assistant"
      >
        <Bot size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-70">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Bot size={18} className="text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">Assistant ZAFIRIX PRO</p>
                  <p className="text-xs text-gray-400">Texte + voix · Actions JSON</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500">
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-3 py-2 border-b border-gray-100 bg-white">
              <BetaSurfaceBadge label="Bêta · Assistant, voix & actions" className="text-[11px]" />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#1B2A4A] text-white rounded-br-md' : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-bl-md'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> Analyse…
                </div>
              )}
            </div>

            {actions.length > 0 && (
              <div className="border-t border-gray-100 bg-white px-4 py-3">
                <p className="text-xs font-semibold text-gray-700">Actions proposées (en attente de confirmation)</p>
                <div className="mt-2 space-y-2 max-h-36 overflow-y-auto">
                  {actions.map((a, idx) => (
                    <div key={idx} className="border border-amber-200 bg-amber-50 rounded-xl p-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-amber-800">{a.action}</p>
                        {typeof a.confidence === 'number' && (
                          <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            {Math.round(a.confidence * 100)}%
                          </span>
                        )}
                      </div>
                      {a.data && (
                        <pre className="mt-1 text-[11px] leading-snug text-amber-900/80 whitespace-pre-wrap wrap-break-word">
                          {JSON.stringify(a.data, null, 2)}
                        </pre>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-amber-800/70">
                          {actionStatus[idx]?.state === 'running' && 'Exécution…'}
                          {actionStatus[idx]?.state === 'done' && (actionStatus[idx]?.message ?? 'Exécuté')}
                          {actionStatus[idx]?.state === 'error' && (actionStatus[idx]?.message ?? 'Erreur')}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void confirmAction(idx)}
                            disabled={actionStatus[idx]?.state === 'running' || actionStatus[idx]?.state === 'done'}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-40"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelAction(idx)}
                            disabled={actionStatus[idx]?.state === 'running' || actionStatus[idx]?.state === 'done'}
                            className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 text-xs font-medium hover:bg-amber-100 disabled:opacity-40"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 p-3 bg-white">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ex: Crée une facture pour Société Alpha de 12 000 MAD HT, délai 30j."
                    className="w-full min-h-[44px] max-h-28 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 resize-none"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => void ttsSpeak(messages[messages.length - 1]?.content ?? '')}
                      className="text-xs text-gray-400 hover:text-indigo-600 flex items-center gap-1"
                    >
                      <Volume2 size={14} /> Lire la réponse
                    </button>
                    <span className="text-[10px] text-gray-400">Voix: Whisper + TTS</span>
                  </div>
                </div>

                {canRecord && (
                  <button
                    type="button"
                    onClick={() => (recording ? stopRecording() : void startRecording())}
                    className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${recording ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    aria-label={recording ? 'Arrêter enregistrement' : 'Démarrer enregistrement'}
                    disabled={loading}
                  >
                    <Mic size={18} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={loading || !input.trim()}
                  className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  <Send size={18} />
                </button>
              </div>
              {recording && (
                <p className="mt-2 text-xs text-red-600">Enregistrement en cours… cliquez sur le micro pour arrêter.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

