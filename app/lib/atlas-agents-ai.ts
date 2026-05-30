import Anthropic from '@anthropic-ai/sdk';
import type { AtlasAgentMessage, AtlasAgentType } from '@/app/types/atlas-agent';
import { ATLAS_AGENT_SYSTEM_PROMPTS } from '@/app/lib/atlas-agents-config';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';

export async function runAgentAssistantReply(params: {
  agentType: AtlasAgentType;
  history: Pick<AtlasAgentMessage, 'role' | 'content'>[];
  userMessage: string;
  /** Extra context appended to the system prompt (e.g. live TVA balances). */
  contextBlock?: string | null;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY missing' };
  }

  const client = new Anthropic({ apiKey });
  const base = ATLAS_AGENT_SYSTEM_PROMPTS[params.agentType];
  const system = params.contextBlock?.trim()
    ? `${base}\n\n${params.contextBlock.trim()}`
    : base;

  const messages: Anthropic.MessageParam[] = [
    ...params.history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    { role: 'user', content: params.userMessage },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system,
      messages,
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return { ok: true, text: text.trim() || '(Réponse vide)' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur API Anthropic';
    return { ok: false, error: message };
  }
}
