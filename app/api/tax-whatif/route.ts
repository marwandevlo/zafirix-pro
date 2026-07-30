import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import { checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import {
  buildWhatIfComparison,
  buildWhatIfDashboard,
  computeWhatIfScenario,
  EXPERT_DISCLAIMER,
  generateWhatIfAiProjection,
  loadFiscalBaseline,
  saveWhatIfScenario,
} from '@/app/lib/atlas-tax-whatif-server';
import type { WhatIfAdjustments } from '@/app/types/atlas-tax-whatif';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const fiscalYear = Number(url.searchParams.get('fiscalYear') ?? new Date().getFullYear());

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  try {
    const dashboard = await buildWhatIfDashboard(admin, session.userId, access.companyId, fiscalYear);
    return NextResponse.json({ ok: true, ...dashboard, disclaimer: EXPERT_DISCLAIMER });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'whatif_load_failed';
    return mapDbError({ message: msg }, { baseline: null, savedScenarios: [] });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action as string | undefined;

  if (!body.companyId) {
    return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const fiscalYear = Number(body.fiscalYear ?? new Date().getFullYear());
  const adjustments = (body.adjustments ?? {}) as WhatIfAdjustments;

  if (action === 'compute') {
    try {
      const baseline = body.baseline
        ? (body.baseline as Awaited<ReturnType<typeof loadFiscalBaseline>>)
        : await loadFiscalBaseline(admin, session.userId, access.companyId, fiscalYear);
      const comparison = buildWhatIfComparison(
        baseline,
        adjustments,
        String(body.label ?? 'Scénario simulé'),
      );
      return NextResponse.json({ ok: true, comparison, disclaimer: EXPERT_DISCLAIMER });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'ai_project') {
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

    try {
      const baseline = body.baseline
        ? (body.baseline as Awaited<ReturnType<typeof loadFiscalBaseline>>)
        : await loadFiscalBaseline(admin, session.userId, access.companyId, fiscalYear);
      const comparison = buildWhatIfComparison(
        baseline,
        adjustments,
        String(body.label ?? 'Scénario simulé'),
      );
      const projection = await generateWhatIfAiProjection(
        comparison,
        body.question as string | undefined,
      );
      return NextResponse.json({ ok: true, comparison, projection, disclaimer: EXPERT_DISCLAIMER });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'save' && body.name) {
    try {
      const baseline = body.baseline
        ? (body.baseline as Awaited<ReturnType<typeof loadFiscalBaseline>>)
        : await loadFiscalBaseline(admin, session.userId, access.companyId, fiscalYear);
      const results = body.results
        ? (body.results as ReturnType<typeof computeWhatIfScenario>)
        : computeWhatIfScenario(baseline, adjustments, String(body.label ?? body.name));
      const saved = await saveWhatIfScenario(admin, session.userId, access.companyId, {
        name: String(body.name),
        fiscalYear,
        baseline,
        adjustments,
        results,
        aiProjection: body.aiProjection as string | undefined,
        aiProvider: body.aiProvider as string | undefined,
      });
      return NextResponse.json({ ok: true, scenario: saved });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
