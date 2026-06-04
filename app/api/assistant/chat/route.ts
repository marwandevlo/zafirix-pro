/**
 * POST /api/assistant/chat — Expert comptable copilot with company context
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { refreshAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';
import { runAtlasAiCopilot, COPILOT_SYSTEM, formatSourcesFooter } from '@/app/lib/atlas-ai-copilot';
import { getOrCreateConversation, logAtlasAiInteraction, touchConversation, listConversationHistory } from '@/app/lib/atlas-ai-interactions';
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

  const conversationId = await getOrCreateConversation(db, userId, companyId, body.conversationId);
  const history = await listConversationHistory(db, userId, conversationId);
  const copilotHistory = history.flatMap((h) => [
    { role: 'user' as const, content: h.prompt },
    { role: 'assistant' as const, content: h.answer },
  ]);

  const result = await runAtlasAiCopilot({
    system: COPILOT_SYSTEM,
    contextBlock: contextToPromptBlock(snapshot),
    sources,
    history: copilotHistory,
    userMessage: message,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  const answer = `${result.answer}${formatSourcesFooter(sources)}`;

  const interactionId = await logAtlasAiInteraction(db, {
    userId,
    companyId,
    conversationId,
    interactionType: 'chat',
    prompt: message,
    answer,
    sourcesUsed: sources,
  });

  await touchConversation(db, conversationId);

  return NextResponse.json({
    ok: true,
    answer,
    sources,
    conversationId,
    interactionId,
    contextRefreshedAt: snapshot.refreshed_at,
  });
}
