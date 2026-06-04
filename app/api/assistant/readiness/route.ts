/**
 * GET /api/assistant/readiness — readiness explainer + closing checklist
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { explainReadiness } from '@/app/lib/atlas-ai-audit';
import { buildFiscalClosingChecklist } from '@/app/lib/atlas-ai-closing';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const db = getSupabaseServiceRoleClient();

  const [readiness, closing] = await Promise.all([
    explainReadiness(db, userId, companyId),
    buildFiscalClosingChecklist(db, userId, companyId),
  ]);

  await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'readiness',
    prompt: 'readiness_explain',
    answer: readiness.explanation.slice(0, 8000),
    sourcesUsed: readiness.sources,
  });

  return NextResponse.json({
    ok: true,
    score: readiness.score,
    breakdown: readiness.breakdown,
    explanation: readiness.explanation,
    sources: readiness.sources,
    closing,
    label: closing.ready ? 'Ready for closing' : 'Not ready',
    labelFr: closing.ready ? 'Prêt pour clôture' : 'Non prêt pour clôture',
  });
}
