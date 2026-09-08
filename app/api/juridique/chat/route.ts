import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateAiRequest } from '@/app/lib/ai-auth-server';
import { checkAiRateLimit } from '@/app/lib/ai-rate-limit';
import { ATLAS_AI_SAFETY_NOTICE } from '@/app/lib/atlas-ai-safety';
import { captureAtlasServerException } from '@/app/lib/atlas-server-log';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';
import { createSseStream } from '@/app/lib/atlas-ai-provider';
import {
  buildJuridiqueChatMessages,
  buildJuridiqueChatSystemPrompt,
  parseJuridiqueChatResponse,
  type JuridiqueChatMessage,
} from '@/app/lib/atlas-juridique-chat-server';
import type { JuridiqueCompany } from '@/app/juridique/juridique-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatBody = {
  message?: string;
  history?: JuridiqueChatMessage[];
  documentDraft?: string;
  documentTitle?: string;
  company?: JuridiqueCompany | null;
  stream?: boolean;
};

async function* streamAnthropicJuridiqueChat(params: {
  system: string;
  messages: Anthropic.MessageParam[];
}): AsyncGenerator<string> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    yield 'Configuration IA indisponible (ANTHROPIC_API_KEY manquante).';
    return;
  }

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    system: params.system,
    messages: params.messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAiRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.code === 'missing_token' ? 'Authentification requise.' : 'Configuration IA indisponible.' },
      { status: auth.status },
    );
  }

  const rate = checkAiRateLimit(`juridique-chat:${auth.user.id}`);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Limite de requêtes atteinte. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as ChatBody;
  const message = String(body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 });
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const documentDraft = String(body.documentDraft ?? '');
  const documentTitle = String(body.documentTitle ?? 'Document juridique').trim() || 'Document juridique';
  const company = body.company ?? null;
  const stream = body.stream === true || request.nextUrl.searchParams.get('stream') === '1';

  const system = buildJuridiqueChatSystemPrompt({ documentDraft, documentTitle, company });
  const messages = buildJuridiqueChatMessages({
    message,
    history,
    documentDraft,
    documentTitle,
    company,
  });

  try {
    if (stream) {
      const gen = streamAnthropicJuridiqueChat({ system, messages });
      return new Response(createSseStream(gen), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const apiKey = getAnthropicApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 503 });
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      system,
      messages,
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsed = parseJuridiqueChatResponse(raw, documentTitle);

    return NextResponse.json({
      ok: true,
      reply: parsed.reply,
      document: parsed.document || documentDraft,
      documentTitle: parsed.documentTitle,
      safetyNotice: ATLAS_AI_SAFETY_NOTICE,
    });
  } catch (error) {
    await captureAtlasServerException(error, { route: '/api/juridique/chat' });
    const msg = error instanceof Error ? error.message : 'Erreur IA';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
