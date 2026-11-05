/**
 * GET  /api/business-studio/studies/[id]/copilot — transcript for this user and study
 * POST /api/business-studio/studies/[id]/copilot — one turn, streamed after the number guard
 *
 * The study model is not written here.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import {
  addUsage, appendTurn, checkCopilotRate, consult, COPILOT_LIMITS, detectLang, estimateTokens, publicThread, withinDailyBudget, type CopilotLang,
} from '@/app/lib/business-studio/copilot';
import { modelAvailable, narrateCopilot } from '@/app/lib/business-studio/copilot-llm';
import { loadCopilotThread, saveCopilotThread } from '@/app/lib/business-studio/copilot-store';
import { getStudy, StoreError } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    await getStudy(db, userId, id);
    const { thread } = await loadCopilotThread(db, userId, id);
    return NextResponse.json({ thread: publicThread(thread) }, noStore);
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const study = await getStudy(db, userId, id);
    const body = await readJsonBody(request);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > COPILOT_LIMITS.maxMessageChars) throw new StoreError(400, 'message_invalid');
    const clientId = typeof body.clientId === 'string' && body.clientId.length <= 80 ? body.clientId : '';
    if (!clientId) throw new StoreError(400, 'client_id_required');
    const hint = body.locale === 'ar' || body.locale === 'fr' || body.locale === 'darija' ? body.locale as CopilotLang : undefined;
    const limit = checkCopilotRate(userId);
    if (!limit.ok) return NextResponse.json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec }, { status: 429, headers: noStore.headers });

    const loaded = await loadCopilotThread(db, userId, id);
    if (Number.isInteger(body.threadRevision) && body.threadRevision !== loaded.thread.threadRevision) {
      throw new StoreError(409, 'copilot_conflict', { threadRevision: loaded.thread.threadRevision });
    }
    if (loaded.thread.messages.some((m) => m.clientId === clientId)) {
      return NextResponse.json({ thread: publicThread(loaded.thread), duplicate: true }, noStore);
    }

    const lang = detectLang(message, hint);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        try {
          send({ type: 'status', status: 'engine' });
          const turn = consult({ model: study.meta.model, userText: message, history: loaded.thread.messages, lang, proposalId: `prop_${loaded.thread.threadRevision + 1}` });
          const inputTokens = estimateTokens(message.length) + loaded.thread.messages.slice(-COPILOT_LIMITS.maxHistoryTurns).reduce((s, m) => s + estimateTokens(m.content.length), 0);
          const allowModel = modelAvailable() && withinDailyBudget(loaded.thread.usage, inputTokens + COPILOT_LIMITS.maxOutputTokens);
          let text = turn.message;
          let provider: 'anthropic' | 'openai' | 'deterministic' = 'deterministic';
          if (allowModel && !request.signal.aborted) {
            const narrated = await narrateCopilot({
              brief: turn.message,
              userText: message,
              history: loaded.thread.messages.map((m) => ({ role: m.role, content: m.content })),
              lang,
              signal: request.signal,
            });
            text = narrated.text;
            provider = narrated.provider;
          }
          const spoken = { ...turn, message: text };
          const appended = appendTurn(loaded.thread, { clientId, content: message, at: new Date().toISOString() }, spoken, provider);
          const usage = provider === 'deterministic'
            ? loaded.thread.usage
            : addUsage(loaded.thread.usage, inputTokens + estimateTokens(text.length));
          const next = { ...appended.thread, usage };
          await saveCopilotThread(db, userId, id, study.companyId, loaded.rowId, next);
          send({
            type: 'meta',
            provider,
            proposal: spoken.proposal,
            contradictions: spoken.contradictions,
            completeness: spoken.completeness,
            threadRevision: next.threadRevision,
          });
          const size = 80;
          for (let i = 0; i < text.length; i += size) send({ type: 'text', text: text.slice(i, i + size) });
          send({ type: 'done', thread: publicThread(next) });
        } catch (e) {
          const code = e instanceof StoreError ? e.code : 'copilot_failed';
          send({ type: 'error', error: code });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
    });
  });
}
