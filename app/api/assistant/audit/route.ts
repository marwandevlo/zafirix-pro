/**
 * GET /api/assistant/audit — AI audit report
 * POST — regenerate audit for fiscal year
 * ?stream=1 — SSE progressive narrative
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { runAtlasAiAuditor } from '@/app/lib/atlas-ai-auditor';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { createSseStream, streamAtlasAiWithFallback } from '@/app/lib/atlas-ai-provider';
import { AUDITOR_SYSTEM } from '@/app/lib/atlas-ai-copilot';
import { buildAtlasAiContext, contextToPromptBlock } from '@/app/lib/atlas-ai-context';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleAudit(
  userId: string,
  companyId: string | null,
  fiscalYear: number,
  stream: boolean,
) {
  const db = getSupabaseServiceRoleClient();
  const report = await runAtlasAiAuditor(db, userId, companyId, { fiscalYear });

  await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'audit',
    prompt: `audit_report_fy_${fiscalYear}`,
    answer: JSON.stringify({
      score: report.score,
      findings: report.findings.length,
      critical: report.criticalIssues.length,
    }),
    sourcesUsed: report.sources,
    metadata: { fiscal_year: fiscalYear, risk_score: report.risk_score, provider: report.provider },
  });

  if (stream) {
    const { snapshot } = await buildAtlasAiContext(db, { userId, companyId, fiscalYear });
    const gen = streamAtlasAiWithFallback({
      system: AUDITOR_SYSTEM,
      contextBlock: contextToPromptBlock(snapshot),
      sourcesLine: `[AUDIT]\n${JSON.stringify(report.findings.slice(0, 10))}`,
      history: [],
      userMessage: 'Résume les principaux risques de ce rapport d\'audit.',
      ruleBasedFallback: () => report.observations.join('\n'),
    });
    return new Response(createSseStream(gen), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  return NextResponse.json({
    ok: true,
    score: report.score,
    risk_score: report.risk_score,
    findings: report.findings,
    recommendations: report.recommendations,
    criticalIssues: report.criticalIssues,
    observations: report.observations,
    sections: report.sections,
    report,
    provider: report.provider,
  });
}

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const fiscalYear = Number(request.nextUrl.searchParams.get('fiscalYear')) || new Date().getFullYear();
  const download = request.nextUrl.searchParams.get('download') === '1';
  const stream = request.nextUrl.searchParams.get('stream') === '1';

  if (download) {
    const db = getSupabaseServiceRoleClient();
    const report = await runAtlasAiAuditor(db, userId, companyId, { fiscalYear });
    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="audit-${fiscalYear}.json"`,
      },
    });
  }

  return handleAudit(userId, companyId, fiscalYear, stream);
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { companyId?: string | null; fiscalYear?: number };
  const companyId = body.companyId?.trim() || null;
  const fiscalYear = body.fiscalYear ?? new Date().getFullYear();

  return handleAudit(userId, companyId, fiscalYear, false);
}
