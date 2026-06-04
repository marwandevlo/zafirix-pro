/**
 * POST /api/assistant/explain — accounting, TVA, IS, document, entry explainers
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { runAtlasAiExplain, type ExplainType } from '@/app/lib/atlas-ai-explain';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { checkAiRateLimit } from '@/app/lib/ai-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set<ExplainType>([
  'accounting_entry',
  'account_code',
  'tva',
  'is',
  'document',
  'readiness',
  'general',
]);

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const rate = checkAiRateLimit(`assistant-explain:${userId}`);
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    entityId?: string;
    accountCode?: string;
    question?: string;
    companyId?: string | null;
    payload?: Record<string, unknown>;
  };

  const rawType = body.type ?? 'general';
  const explainType = VALID_TYPES.has(rawType as ExplainType) ? (rawType as ExplainType) : 'general';
  const companyId = body.companyId?.trim() || null;
  const db = getSupabaseServiceRoleClient();

  const result = await runAtlasAiExplain(db, userId, {
    type: explainType,
    entityId: body.entityId,
    accountCode: body.accountCode,
    question: body.question,
    companyId,
    payload: body.payload,
  });

  const interactionId = await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'explain',
    prompt: body.question?.trim() || `explain:${explainType}`,
    answer: result.answer,
    sourcesUsed: result.sources,
    metadata: {
      type: explainType,
      entityId: body.entityId,
      accountCode: body.accountCode,
      confidence: result.confidence,
      structured: result.structured,
    },
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    answer: result.answer,
    sources: result.sources,
    confidence: result.confidence,
    type: result.type,
    structured: result.structured,
    interaction_id: interactionId,
  });
}
