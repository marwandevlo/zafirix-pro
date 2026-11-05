/**
 * Optional wording pass. Uses the Anthropic key already read by the Atlas assistant, then the OpenAI key,
 * then the deterministic brief. A paraphrase that contains a new multi-digit figure is discarded.
 * This module does not choose a new vendor or raise a spending commitment.
 */

import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';
import { getOpenAiApiKey } from '@/app/lib/openai-env';
import { assertNoNewNumbers, COPILOT_LIMITS, type CopilotLang } from './copilot';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const OPENAI_MODEL = 'gpt-4o-mini';

export type Narration = { text: string; provider: 'anthropic' | 'openai' | 'deterministic' };

function systemPrompt(lang: CopilotLang): string {
  return [
    'You are the wording layer of ZafirixPro Business Studio.',
    'Rewrite CONSULTANT_BRIEF in the requested language. French, Moroccan Darija, or Arabic.',
    'Every number you write must already appear in CONSULTANT_BRIEF or in the user message.',
    'Do not add a revenue, profit, tax, VAT, DSCR, NPV, or IRR figure.',
    'Do not say you verified facts, the market, or tax law.',
    'Do not tell the user that a change was saved.',
    `Language: ${lang}.`,
  ].join('\n');
}

async function attempt(run: () => Promise<string | null>, signal?: AbortSignal): Promise<string | null> {
  for (let i = 0; i < 2; i += 1) {
    if (signal?.aborted) return null;
    try {
      return await run();
    } catch (e) {
      const status = typeof e === 'object' && e && 'status' in e ? Number((e as { status?: number }).status) : 0;
      if (signal?.aborted || i === 1 || (status !== 429 && status < 500)) return null;
    }
  }
  return null;
}

async function runAnthropic(brief: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, lang: CopilotLang, signal?: AbortSignal): Promise<string | null> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return attempt(async () => {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: COPILOT_LIMITS.maxOutputTokens,
      system: systemPrompt(lang),
      messages: [
        ...history.slice(-COPILOT_LIMITS.maxHistoryTurns).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
        { role: 'user', content: `CONSULTANT_BRIEF:\n${brief}` },
      ],
    }, { signal });
    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return text || null;
  }, signal);
}

async function runOpenAi(brief: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, lang: CopilotLang, signal?: AbortSignal): Promise<string | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;
  return attempt(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: COPILOT_LIMITS.maxOutputTokens,
        messages: [
          { role: 'system', content: systemPrompt(lang) },
          ...history.slice(-COPILOT_LIMITS.maxHistoryTurns).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
          { role: 'user', content: `CONSULTANT_BRIEF:\n${brief}` },
        ],
      }),
    });
    if (!res.ok) {
      const err = new Error('openai_failed') as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  }, signal);
}

export async function narrateCopilot(input: {
  brief: string;
  userText: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lang: CopilotLang;
  signal?: AbortSignal;
}): Promise<Narration> {
  const allowed = `${input.brief}\n${input.userText}`;
  const anthropic = await runAnthropic(input.brief, input.history, input.lang, input.signal);
  if (anthropic && assertNoNewNumbers(allowed, anthropic)) return { text: anthropic, provider: 'anthropic' };
  const openai = await runOpenAi(input.brief, input.history, input.lang, input.signal);
  if (openai && assertNoNewNumbers(allowed, openai)) return { text: openai, provider: 'openai' };
  return { text: input.brief, provider: 'deterministic' };
}

export function modelAvailable(): boolean {
  return getAnthropicApiKey() != null || getOpenAiApiKey() != null;
}
