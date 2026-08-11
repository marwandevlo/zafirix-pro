/**
 * GET  /api/usage?companyId=
 * POST /api/usage  { action: 'check'|'addon'|'plan', companyId, ... }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiError,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
} from '@/app/lib/atlas-api-response';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  buildZafirixUsageSummary,
  changeZafirixPlan,
  checkZafirixUsage,
  requestZafirixAddon,
} from '@/app/lib/zafirix-usage-server';
import type { ZafirixMeterCode, ZafirixPlanCode } from '@/app/types/zafirix-usage';
import { ZAFIRIX_METER_CODES, ZAFIRIX_PLAN_CODES } from '@/app/types/zafirix-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const db = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(db, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const summary = await buildZafirixUsageSummary(db, session.userId, access.companyId);
  if (!summary) {
    return NextResponse.json({
      ok: true,
      unavailable: true,
      message: 'Compteurs d’utilisation en cours de déploiement.',
    });
  }

  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    action?: 'check' | 'addon' | 'plan';
    companyId?: string;
    meter?: string;
    quantity?: number;
    packCode?: string;
    planCode?: string;
    activateNow?: boolean;
  };

  const companyId = body.companyId?.trim();
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const db = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(db, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const action = body.action ?? 'check';

  if (action === 'check') {
    const meter = body.meter as ZafirixMeterCode;
    if (!ZAFIRIX_METER_CODES.includes(meter)) {
      return apiBadRequest('invalid_meter', 'Compteur inconnu.');
    }
    const check = await checkZafirixUsage(
      db,
      session.userId,
      access.companyId,
      meter,
      body.quantity ?? 1,
    );
    return NextResponse.json({ ok: true, ...check }, { status: check.allowed ? 200 : 429 });
  }

  if (action === 'addon') {
    if (!body.packCode?.trim()) {
      return apiBadRequest('missing_fields', 'Pack obligatoire.');
    }
    const result = await requestZafirixAddon(db, {
      companyId: access.companyId,
      userId: session.userId,
      packCode: body.packCode.trim(),
      activateNow: !!body.activateNow,
    });
    if (!result.ok) {
      return apiError(result.error, result.messageFr ?? result.error, 400);
    }
    const summary = await buildZafirixUsageSummary(db, session.userId, access.companyId);
    return NextResponse.json({
      ok: true,
      purchaseId: result.purchaseId,
      status: result.status,
      activated: result.activated,
      message: result.activated
        ? 'Pack activé — vos quotas ont été augmentés.'
        : 'Demande enregistrée — finalisez le paiement pour activer le pack.',
      summary,
    });
  }

  if (action === 'plan') {
    const planCode = body.planCode as ZafirixPlanCode;
    if (!ZAFIRIX_PLAN_CODES.includes(planCode)) {
      return apiBadRequest('invalid_plan', 'Forfait inconnu.');
    }
    const result = await changeZafirixPlan(db, access.companyId, session.userId, planCode);
    if (!result.ok) return apiError(result.error, result.error, 400);
    const summary = await buildZafirixUsageSummary(db, session.userId, access.companyId);
    return NextResponse.json({ ok: true, subscription: result.subscription, summary });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
