/**
 * POST /api/assistant/explain — accounting, TVA, IS, document, entry explainers
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { refreshAtlasAiContext, contextToPromptBlock, buildAtlasAiContext } from '@/app/lib/atlas-ai-context';
import {
  runAtlasAiCopilot,
  COPILOT_SYSTEM,
  EXPLAINER_ACCOUNTING,
  EXPLAINER_TVA,
  EXPLAINER_IS,
  EXPLAINER_DOCUMENT,
  formatSourcesFooter,
} from '@/app/lib/atlas-ai-copilot';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { checkAiRateLimit } from '@/app/lib/ai-rate-limit';
import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const rate = checkAiRateLimit(`assistant-explain:${userId}`);
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    entityId?: string;
    question?: string;
    companyId?: string | null;
    payload?: Record<string, unknown>;
  };

  const explainType = body.type ?? 'general';
  const companyId = body.companyId?.trim() || null;
  const db = getSupabaseServiceRoleClient();

  const { snapshot } = await refreshAtlasAiContext(db, { userId, companyId });
  const { sources: baseSources } = await buildAtlasAiContext(db, { userId, companyId });
  const sources: AiSourceRef[] = [...baseSources];
  let system = COPILOT_SYSTEM;
  let subjectBlock = '';

  if (explainType === 'accounting_entry' && body.entityId) {
    system = EXPLAINER_ACCOUNTING;
    const { data } = await db.from('atlas_accounting_entries').select('*').eq('id', body.entityId).eq('user_id', userId).maybeSingle();
    subjectBlock = `[ÉCRITURE]\n${JSON.stringify(data ?? body.payload ?? {}, null, 2)}`;
    sources.push({ type: 'accounting_entry', id: body.entityId, label: 'Écriture' });
  } else if (explainType === 'document' && body.entityId) {
    system = EXPLAINER_DOCUMENT;
    const { data: doc } = await db.from('atlas_documents').select('*').eq('id', body.entityId).eq('user_id', userId).maybeSingle();
    const { data: route } = await db.from('zafirix_routing_records').select('*').eq('source_document_id', body.entityId).limit(5);
    subjectBlock = `[DOCUMENT]\n${JSON.stringify({ doc, routing: route }, null, 2)}`;
    sources.push({ type: 'document', id: body.entityId, label: 'Document' });
  } else if (explainType === 'tva') {
    system = EXPLAINER_TVA;
    subjectBlock = `[TVA]\n${JSON.stringify(snapshot.tva, null, 2)}`;
    sources.push({ type: 'tva', id: 'context', label: 'TVA' });
  } else if (explainType === 'is') {
    system = EXPLAINER_IS;
    const fy = new Date().getFullYear();
    const { data: isDraft } = await db.from('atlas_is_drafts').select('*').eq('user_id', userId).eq('fiscal_year', fy).maybeSingle();
    subjectBlock = `[IS + LIASSE]\n${JSON.stringify({ isDraft, liasse: snapshot.liasse }, null, 2)}`;
    sources.push({ type: 'liasse', id: String(fy), label: 'IS/Liasse' });
  } else {
    subjectBlock = body.payload ? JSON.stringify(body.payload) : '';
  }

  const question = body.question?.trim() || 'Explique cet élément en détail pour un dirigeant.';

  const result = await runAtlasAiCopilot({
    system,
    contextBlock: `${contextToPromptBlock(snapshot)}\n\n${subjectBlock}`,
    sources,
    history: [],
    userMessage: question,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });

  const answer = `${result.answer}${formatSourcesFooter(sources)}`;

  await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'explain',
    prompt: question,
    answer,
    sourcesUsed: sources,
    metadata: { type: explainType, entityId: body.entityId },
  });

  return NextResponse.json({ ok: true, answer, sources, type: explainType });
}
