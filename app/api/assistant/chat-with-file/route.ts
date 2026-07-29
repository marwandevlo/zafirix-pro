/**
 * POST /api/assistant/chat-with-file — multipart chat with uploaded document context
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { parseAssistantUploadedFile } from '@/app/lib/atlas-assistant-file-parser';
import { refreshAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';
import { buildCabinetAiContext, cabinetContextToPromptBlock } from '@/app/lib/atlas-ai-cabinet-context';
import { buildBillingAiContext, billingContextToPromptBlock } from '@/app/lib/atlas-ai-billing-context';
import { runAtlasAiCopilot, COPILOT_SYSTEM, formatSourcesFooter } from '@/app/lib/atlas-ai-copilot';
import {
  getOrCreateConversation,
  logAtlasAiInteraction,
  touchConversation,
  listConversationHistory,
  updateConversationTitleFromMessage,
} from '@/app/lib/atlas-ai-interactions';
import { computeCopilotConfidence } from '@/app/lib/atlas-ai-confidence';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { checkAiEndpointRateLimit, checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const rate = checkAiEndpointRateLimit(`assistant-file:${userId}`);
  if (!rate.ok) {
    const rl = rateLimitResponse(rate);
    return NextResponse.json(rl.body, { status: rl.status });
  }

  const db = getSupabaseServiceRoleClient();
  const { workspaceId } = await ensureWorkspaceSubscription(db, userId);
  const wsRate = checkWorkspaceRateLimit(workspaceId, 'ai_chat', userId);
  if (!wsRate.ok) {
    const rl = rateLimitResponse(wsRate);
    return NextResponse.json(rl.body, { status: rl.status });
  }

  const meter = await meterFeatureUsage(db, userId, 'ai_request');
  if (!meter.ok) {
    return NextResponse.json({ error: meter.code, message: meter.messageFr }, { status: meter.status });
  }

  const form = await request.formData();
  const message = String(form.get('message') ?? '').trim();
  const file = form.get('file');
  const companyId = String(form.get('companyId') ?? '').trim() || null;
  const conversationIdRaw = String(form.get('conversationId') ?? '').trim() || null;

  if (!message) return NextResponse.json({ error: 'message_required' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'file_too_large', message: 'Fichier max 15 Mo.' }, { status: 400 });
  }

  const mimeType = file.type || 'application/octet-stream';
  const extOk = /\.(pdf|csv|xlsx?|txt|png|jpe?g|webp|gif)$/i.test(file.name);
  if (!ALLOWED_TYPES.includes(mimeType) && !extOk) {
    return NextResponse.json(
      { error: 'unsupported_file_type', message: 'Formats acceptés: PDF, Excel, CSV, images.' },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseAssistantUploadedFile(buffer, file.name, mimeType, message);

  const { snapshot, sources } = await refreshAtlasAiContext(db, {
    userId,
    companyId,
    companyProfile: null,
  });

  const cabinetCtx = await buildCabinetAiContext(db, userId).catch(() => null);
  const billingCtx = await buildBillingAiContext(db, userId).catch(() => null);
  const fileBlock = `[DOCUMENT_TÉLÉVERSÉ]\nFichier: ${parsed.filename}\nType: ${parsed.mimeType}\nContenu extrait:\n${parsed.textContent}`;
  const contextBlock = `${contextToPromptBlock(snapshot)}${cabinetCtx ? `\n\n${cabinetContextToPromptBlock(cabinetCtx)}` : ''}${billingCtx ? `\n\n${billingContextToPromptBlock(billingCtx)}` : ''}\n\n${fileBlock}`;

  const conversationId = await getOrCreateConversation(db, userId, companyId, conversationIdRaw);
  const history = await listConversationHistory(db, userId, conversationId);
  const copilotHistory = history.flatMap((h) => [
    { role: 'user' as const, content: h.prompt },
    { role: 'assistant' as const, content: h.answer },
  ]);

  const userMessage = `${message}\n\n[J'ai joint le fichier « ${parsed.filename} » pour analyse.]`;

  const result = await runAtlasAiCopilot({
    system: `${COPILOT_SYSTEM}\n\nMode: ANALYSE DE FICHIER TÉLÉVERSÉ.\nTu dois t'appuyer sur le contenu extrait du document ET le contexte Atlas. Conformité DGI / droit marocain.`,
    contextBlock,
    sources,
    history: copilotHistory,
    userMessage,
  });

  const answer = `${result.answer}${formatSourcesFooter(sources)}`;
  const confidence = computeCopilotConfidence({
    sources,
    hasAnswer: true,
    contextLoaded: true,
    subjectLoaded: true,
  });

  const interactionId = await logAtlasAiInteraction(db, {
    userId,
    companyId,
    conversationId,
    interactionType: 'chat',
    prompt: userMessage,
    answer,
    sourcesUsed: sources,
    metadata: {
      confidence,
      provider: result.provider,
      uploaded_file: parsed.filename,
      file_truncated: parsed.truncated,
    },
  });

  await touchConversation(db, conversationId);
  if (history.length === 0) {
    await updateConversationTitleFromMessage(db, conversationId, message).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    answer,
    sources,
    confidence,
    conversationId,
    interactionId,
    provider: result.provider,
    file: { name: parsed.filename, truncated: parsed.truncated },
  });
}
