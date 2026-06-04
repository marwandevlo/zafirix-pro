/**
 * POST /api/assistant/chat — Expert comptable copilot with company context
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { refreshAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';
import { buildCabinetAiContext, cabinetContextToPromptBlock } from '@/app/lib/atlas-ai-cabinet-context';
import { buildBillingAiContext, billingContextToPromptBlock } from '@/app/lib/atlas-ai-billing-context';
import { runAtlasAiCopilot, streamAtlasAiCopilot, COPILOT_SYSTEM, formatSourcesFooter } from '@/app/lib/atlas-ai-copilot';
import { createSseStream } from '@/app/lib/atlas-ai-provider';
import {
  getOrCreateConversation,
  logAtlasAiInteraction,
  touchConversation,
  listConversationHistory,
  updateConversationTitleFromMessage,
} from '@/app/lib/atlas-ai-interactions';
import { computeCopilotConfidence } from '@/app/lib/atlas-ai-confidence';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { checkAiRateLimit } from '@/app/lib/ai-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const rate = checkAiRateLimit(`assistant:${userId}`);
  if (!rate.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    companyId?: string | null;
    conversationId?: string | null;
    companyProfile?: Record<string, unknown>;
    stream?: boolean;
  };

  const message = String(body.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'message_required' }, { status: 400 });

  const companyId = body.companyId?.trim() || null;
  const db = getSupabaseServiceRoleClient();

  const { snapshot, sources } = await refreshAtlasAiContext(db, {
    userId,
    companyId,
    companyProfile: body.companyProfile ?? null,
  });

  const cabinetCtx = await buildCabinetAiContext(db, userId).catch(() => null);
  const billingCtx = await buildBillingAiContext(db, userId).catch(() => null);
  const contextBlock = `${contextToPromptBlock(snapshot)}${cabinetCtx ? `\n\n${cabinetContextToPromptBlock(cabinetCtx)}` : ''}${billingCtx ? `\n\n${billingContextToPromptBlock(billingCtx)}` : ''}`;

  const conversationId = await getOrCreateConversation(db, userId, companyId, body.conversationId);
  const history = await listConversationHistory(db, userId, conversationId);
  const copilotHistory = history.flatMap((h) => [
    { role: 'user' as const, content: h.prompt },
    { role: 'assistant' as const, content: h.answer },
  ]);

  const stream = body.stream === true || request.nextUrl.searchParams.get('stream') === '1';

  if (stream) {
    const gen = streamAtlasAiCopilot({
      system: COPILOT_SYSTEM,
      contextBlock: contextBlock,
      sources,
      history: copilotHistory,
      userMessage: message,
    });
    return new Response(createSseStream(gen), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  const result = await runAtlasAiCopilot({
    system: COPILOT_SYSTEM,
    contextBlock: contextBlock,
    sources,
    history: copilotHistory,
    userMessage: message,
  });

  const answer = `${result.answer}${formatSourcesFooter(sources)}`;
  const confidence = computeCopilotConfidence({
    sources,
    hasAnswer: true,
    contextLoaded: true,
    subjectLoaded: sources.length > 0,
  });

  const interactionId = await logAtlasAiInteraction(db, {
    userId,
    companyId,
    conversationId,
    interactionType: 'chat',
    prompt: message,
    answer,
    sourcesUsed: sources,
    metadata: { confidence, provider: result.provider, workspace_id: cabinetCtx?.workspace_id ?? billingCtx?.workspace_id ?? null, plan_code: billingCtx?.plan_code ?? null },
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
    contextRefreshedAt: snapshot.refreshed_at,
  });
}
