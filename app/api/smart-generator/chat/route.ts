import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateAiRequest } from '@/app/lib/ai-auth-server';
import { checkAiRateLimit } from '@/app/lib/ai-rate-limit';
import { parseAssistantUploadedFile } from '@/app/lib/atlas-assistant-file-parser';
import { ATLAS_AI_SAFETY_NOTICE } from '@/app/lib/atlas-ai-safety';
import { createSseStream } from '@/app/lib/atlas-ai-provider';
import { captureAtlasServerException } from '@/app/lib/atlas-server-log';
import {
  buildSmartGeneratorChatMessages,
  buildSmartGeneratorChatSystemPrompt,
  parseSmartGeneratorChatResponse,
  type SmartGeneratorChatAttachment,
  type SmartGeneratorChatMessage,
} from '@/app/lib/atlas-smart-generator-chat-server';
import type { SmartGeneratorHeader } from '@/app/types/atlas-smart-generator';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

type ChatBody = {
  message?: string;
  history?: SmartGeneratorChatMessage[];
  documentDraft?: string;
  documentTitle?: string;
  companyHeader?: SmartGeneratorHeader | null;
  stream?: boolean;
  attachment?: {
    filename?: string;
    mimeType?: string;
    base64?: string;
  } | null;
};

function isAllowedAttachment(filename: string, mimeType: string): boolean {
  const lower = filename.toLowerCase();
  if (ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) return true;
  return /\.(pdf|docx?|txt|png|jpe?g)$/i.test(lower);
}

async function resolveAttachment(
  raw: ChatBody['attachment'],
  userHint: string,
): Promise<SmartGeneratorChatAttachment | null> {
  if (!raw?.base64?.trim()) return null;

  const filename = String(raw.filename ?? 'piece_jointe').trim() || 'piece_jointe';
  const mimeType = String(raw.mimeType ?? 'application/octet-stream').trim();

  if (!isAllowedAttachment(filename, mimeType)) {
    throw new Error('unsupported_file_type');
  }

  const buffer = Buffer.from(raw.base64, 'base64');
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('file_too_large');
  if (buffer.length === 0) throw new Error('empty_file');

  const parsed = await parseAssistantUploadedFile(buffer, filename, mimeType, userHint);
  return {
    filename: parsed.filename,
    mimeType: parsed.mimeType,
    textContent: parsed.textContent,
    truncated: parsed.truncated,
  };
}

async function* streamAnthropicSmartGeneratorChat(params: {
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
    max_tokens: 16384,
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

  const rate = checkAiRateLimit(`smart-generator-chat:${auth.user.id}`);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Limite de requêtes atteinte. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as ChatBody;
  const messageRaw = String(body.message ?? '').trim();
  const hasAttachmentPayload = Boolean(body.attachment?.base64?.trim());

  if (!messageRaw && !hasAttachmentPayload) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 });
  }

  const message =
    messageRaw ||
    'Analyse la pièce jointe et exécute ma consigne librement (digitalisation, reformatage, calculs, traduction, clauses).';

  const history = Array.isArray(body.history) ? body.history : [];
  const documentDraft = String(body.documentDraft ?? '');
  const documentTitle = String(body.documentTitle ?? 'Document').trim() || 'Document';
  const companyHeader = body.companyHeader ?? null;
  const stream = body.stream === true || request.nextUrl.searchParams.get('stream') === '1';

  let attachment: SmartGeneratorChatAttachment | null = null;
  try {
    attachment = await resolveAttachment(body.attachment, message);
  } catch (err) {
    const code = err instanceof Error ? err.message : 'attachment_failed';
    const status = code === 'file_too_large' ? 413 : code === 'unsupported_file_type' ? 415 : 400;
    const messages: Record<string, string> = {
      file_too_large: 'Fichier trop volumineux (max 10 Mo).',
      unsupported_file_type: 'Format non supporté. Utilisez PDF, Word, TXT, PNG ou JPG.',
      empty_file: 'Fichier vide.',
    };
    return NextResponse.json({ error: code, message: messages[code] ?? 'Pièce jointe invalide.' }, { status });
  }

  const system = buildSmartGeneratorChatSystemPrompt({
    documentDraft,
    documentTitle,
    companyHeader,
    attachment,
  });
  const messages = buildSmartGeneratorChatMessages({
    message,
    history,
    documentDraft,
    documentTitle,
    companyHeader,
    attachment,
  });

  try {
    if (stream) {
      const gen = streamAnthropicSmartGeneratorChat({ system, messages });
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
      max_tokens: 16384,
      system,
      messages,
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsed = parseSmartGeneratorChatResponse(raw, documentTitle);

    return NextResponse.json({
      ok: true,
      reply: parsed.reply,
      document: parsed.document || documentDraft,
      documentTitle: parsed.documentTitle,
      structured: parsed.structured,
      attachment: attachment ? { filename: attachment.filename, truncated: attachment.truncated } : null,
      safetyNotice: ATLAS_AI_SAFETY_NOTICE,
    });
  } catch (error) {
    await captureAtlasServerException(error, { route: '/api/smart-generator/chat' });
    const msg = error instanceof Error ? error.message : 'Erreur IA';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
