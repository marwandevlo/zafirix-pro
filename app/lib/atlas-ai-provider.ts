/**
 * Phase 13C — AI provider chain: Anthropic → OpenAI → rule-based fallback.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';
import { getOpenAiApiKey } from '@/app/lib/openai-env';
import type { CopilotMessage } from '@/app/lib/atlas-ai-copilot';

export type AiProviderName = 'anthropic' | 'openai' | 'rule-based';

export type AiProviderRunResult = {
  answer: string;
  provider: AiProviderName;
};

export type AiProviderRunParams = {
  system: string;
  contextBlock: string;
  sourcesLine: string;
  history: CopilotMessage[];
  userMessage: string;
  ruleBasedFallback?: () => string;
};

function buildSystem(params: AiProviderRunParams): string {
  return `${params.system}\n\n${params.contextBlock}\n\n${params.sourcesLine}`;
}

async function runAnthropic(params: AiProviderRunParams): Promise<string | null> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...params.history.slice(-16).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: params.userMessage },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: buildSystem(params),
      messages,
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function runOpenAi(params: AiProviderRunParams): Promise<string | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;

  const messages = [
    { role: 'system', content: buildSystem(params) },
    ...params.history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: params.userMessage },
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4096,
        messages,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export function defaultRuleBasedAnswer(params: AiProviderRunParams): string {
  if (params.ruleBasedFallback) return params.ruleBasedFallback();
  return (
    'Réponse générée en mode rule-based (aucune clé API IA configurée).\n\n' +
    'Données Atlas disponibles dans le contexte ci-dessus. ' +
    'Consultez les modules TVA, Banque, Paie et Liasse pour le détail.\n\n' +
    `Question: ${params.userMessage.slice(0, 200)}`
  );
}

export async function runAtlasAiWithFallback(params: AiProviderRunParams): Promise<AiProviderRunResult> {
  const anthropic = await runAnthropic(params);
  if (anthropic) return { answer: anthropic, provider: 'anthropic' };

  const openai = await runOpenAi(params);
  if (openai) return { answer: openai, provider: 'openai' };

  return { answer: defaultRuleBasedAnswer(params), provider: 'rule-based' };
}

/** Yield answer in chunks for SSE (simulated streaming for rule-based / full buffer for APIs). */
export async function* streamAtlasAiWithFallback(params: AiProviderRunParams): AsyncGenerator<string> {
  const result = await runAtlasAiWithFallback(params);
  const chunkSize = 48;
  for (let i = 0; i < result.answer.length; i += chunkSize) {
    yield result.answer.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 8));
  }
}

export function createSseStream(generator: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream_error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}
