/**
 * GET /api/executive-briefing — aggregated KPIs + optional AI briefing
 * ?companyId=&preset=month|quarter|year&lang=fr|en|ar|darija&generate=1&stream=1
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
} from '@/app/lib/atlas-api-response';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import {
  aggregateExecutiveBriefingMetrics,
  generateExecutiveBriefing,
  streamExecutiveBriefingNarrative,
} from '@/app/lib/atlas-executive-briefing-server';
import { createSseStream } from '@/app/lib/atlas-ai-provider';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import { checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { BriefingLanguage } from '@/app/types/atlas-executive-briefing';
import { BRIEFING_LANGUAGE_LABELS } from '@/app/types/atlas-executive-briefing';
import type { AtlasReportPeriodPreset } from '@/app/types/atlas-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_LANGS: BriefingLanguage[] = ['fr', 'en', 'ar', 'darija'];
const VALID_PRESETS: AtlasReportPeriodPreset[] = ['month', 'quarter', 'year'];

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const sp = request.nextUrl.searchParams;
  const companyId = sp.get('companyId')?.trim();
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const preset = (sp.get('preset') ?? 'month') as AtlasReportPeriodPreset;
  if (!VALID_PRESETS.includes(preset)) {
    return apiBadRequest('invalid_preset', 'Période invalide.');
  }

  const langParam = (sp.get('lang') ?? 'fr') as BriefingLanguage;
  const language = VALID_LANGS.includes(langParam) ? langParam : 'fr';
  const generate = sp.get('generate') === '1' || sp.get('generate') === 'true';
  const stream = sp.get('stream') === '1';

  if (generate) {
    const { workspaceId } = await ensureWorkspaceSubscription(admin, session.userId);
    const wsRate = checkWorkspaceRateLimit(workspaceId, 'ai_executive', session.userId);
    if (!wsRate.ok) {
      const rl = rateLimitResponse(wsRate);
      return NextResponse.json(rl.body, { status: rl.status });
    }
    const meter = await meterFeatureUsage(admin, session.userId, 'ai_request', { companyId: access.companyId });
    if (!meter.ok) {
      return NextResponse.json({ error: meter.code, message: meter.messageFr }, { status: meter.status });
    }

    const opts = { preset, language };

    if (stream) {
      const gen = streamExecutiveBriefingNarrative(admin, session.userId, access.companyId, opts);
      return new Response(createSseStream(gen), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const report = await generateExecutiveBriefing(admin, session.userId, access.companyId, opts);

    await logAtlasAiInteraction(admin, {
      userId: session.userId,
      companyId: access.companyId,
      interactionType: 'executive_summary',
      prompt: `ceo_briefing_${preset}_${language}`,
      answer: report.narrative.slice(0, 8000),
      sourcesUsed: [],
      metadata: {
        metrics: report.metrics,
        language,
        period_label: report.period.periodLabel,
        provider: report.provider,
      },
    });

    return NextResponse.json({
      ok: true,
      ...report,
      languageLabels: BRIEFING_LANGUAGE_LABELS,
    });
  }

  const payload = await aggregateExecutiveBriefingMetrics(admin, session.userId, access.companyId, preset);
  return NextResponse.json({
    ok: true,
    ...payload,
    languageLabels: BRIEFING_LANGUAGE_LABELS,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    action?: 'generate';
    companyId?: string;
    preset?: AtlasReportPeriodPreset;
    language?: BriefingLanguage;
  };

  if (!body.companyId) {
    return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  if (body.action === 'generate') {
    const preset = body.preset ?? 'month';
    const language = body.language && VALID_LANGS.includes(body.language) ? body.language : 'fr';

    const { workspaceId } = await ensureWorkspaceSubscription(admin, session.userId);
    const wsRate = checkWorkspaceRateLimit(workspaceId, 'ai_executive', session.userId);
    if (!wsRate.ok) {
      const rl = rateLimitResponse(wsRate);
      return NextResponse.json(rl.body, { status: rl.status });
    }
    const meter = await meterFeatureUsage(admin, session.userId, 'ai_request', { companyId: access.companyId });
    if (!meter.ok) {
      return NextResponse.json({ error: meter.code, message: meter.messageFr }, { status: meter.status });
    }

    const report = await generateExecutiveBriefing(admin, session.userId, access.companyId, { preset, language });

    await logAtlasAiInteraction(admin, {
      userId: session.userId,
      companyId: access.companyId,
      interactionType: 'executive_summary',
      prompt: `ceo_briefing_${preset}_${language}`,
      answer: report.narrative.slice(0, 8000),
      sourcesUsed: [],
      metadata: { metrics: report.metrics, language, provider: report.provider },
    });

    return NextResponse.json({ ok: true, ...report });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
