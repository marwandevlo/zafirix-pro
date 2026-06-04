/**
 * GET /api/assistant/closing — fiscal closing evaluation
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { evaluateFiscalClosing } from '@/app/lib/atlas-ai-closing-assistant';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const fiscalYear = Number(request.nextUrl.searchParams.get('fiscalYear')) || new Date().getFullYear();
  const db = getSupabaseServiceRoleClient();

  const result = await evaluateFiscalClosing(db, userId, companyId, fiscalYear);

  await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'closing',
    prompt: 'closing_evaluation',
    answer: JSON.stringify({ ready: result.ready, score: result.score, blockers: result.blockingIssues.length }),
    sourcesUsed: result.sources,
    metadata: { fiscal_year: fiscalYear, estimatedReadiness: result.estimatedReadiness },
  });

  return NextResponse.json({
    ok: true,
    ready: result.ready,
    score: result.score,
    blockingIssues: result.blockingIssues,
    recommendations: result.recommendations,
    estimatedReadiness: result.estimatedReadiness,
    checklist: result.checklist,
    labelFr: result.ready ? 'Prêt pour clôture fiscale' : 'Clôture non recommandée',
    sources: result.sources,
  });
}
