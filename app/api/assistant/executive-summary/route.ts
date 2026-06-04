/**
 * GET /api/assistant/executive-summary — management summary
 * ?stream=1 — SSE narrative
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { generateExecutiveSummary, streamExecutiveSummaryNarrative, type ExecutivePeriod } from '@/app/lib/atlas-ai-executive-summary';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { createSseStream } from '@/app/lib/atlas-ai-provider';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const companyId = sp.get('companyId')?.trim() || null;
  const period = (sp.get('period') ?? 'month') as ExecutivePeriod;
  const year = Number(sp.get('year')) || new Date().getFullYear();
  const month = Number(sp.get('month')) || new Date().getMonth() + 1;
  const quarter = Number(sp.get('quarter')) || Math.ceil(month / 3);
  const stream = sp.get('stream') === '1';

  const db = getSupabaseServiceRoleClient();
  const { workspaceId } = await ensureWorkspaceSubscription(db, userId);
  const wsRate = checkWorkspaceRateLimit(workspaceId, 'ai_executive', userId);
  if (!wsRate.ok) {
    const rl = rateLimitResponse(wsRate);
    return NextResponse.json(rl.body, { status: rl.status });
  }
  const meter = await meterFeatureUsage(db, userId, 'ai_request', { companyId });
  if (!meter.ok) {
    return NextResponse.json({ error: meter.code, message: meter.messageFr }, { status: meter.status });
  }

  const opts = { period, year, month, quarter };

  if (stream) {
    const gen = streamExecutiveSummaryNarrative(db, userId, companyId, opts);
    return new Response(createSseStream(gen), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  const result = await generateExecutiveSummary(db, userId, companyId, opts);

  await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'executive_summary',
    prompt: `executive_${period}_${year}`,
    answer: result.narrative.slice(0, 8000),
    sourcesUsed: result.sources,
    metadata: { metrics: result.metrics, period_label: result.period_label, provider: result.provider },
  });

  return NextResponse.json({
    ok: true,
    period: result.period,
    period_label: result.period_label,
    fiscal_year: result.fiscal_year,
    metrics: result.metrics,
    narrative: result.narrative,
    risks: result.risks,
    recommendations: result.recommendations,
    sources: result.sources,
    provider: result.provider,
  });
}
