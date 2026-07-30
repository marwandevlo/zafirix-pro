import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiNotFound,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import {
  ASSET_CATEGORY_LABELS,
  ASSET_CLASS_LABELS,
  ASSET_STATUS_LABELS,
  createFixedAsset,
  generateDepreciationSchedule,
  getFixedAssetsPayload,
  postAllPlannedDepreciation,
  postDepreciationSchedule,
  SCHEDULE_STATUS_LABELS,
} from '@/app/lib/atlas-fixed-assets-server';
import type { AssetCategory, AssetClass } from '@/app/types/atlas-fixed-assets';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  try {
    const payload = await getFixedAssetsPayload(admin, session.userId, access.companyId);
    return NextResponse.json({
      ok: true,
      ...payload,
      categoryLabels: ASSET_CATEGORY_LABELS,
      classLabels: ASSET_CLASS_LABELS,
      statusLabels: ASSET_STATUS_LABELS,
      scheduleStatusLabels: SCHEDULE_STATUS_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fixed_assets_load_failed';
    return mapDbError({ message: msg }, { assets: [], schedules: [], events: [], summary: {} });
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

  if (action === 'create_asset' && body.name && body.acquisitionCostHT != null) {
    try {
      const asset = await createFixedAsset(admin, session.userId, access.companyId, {
        name: String(body.name),
        assetCode: body.assetCode as string | undefined,
        description: body.description as string | undefined,
        assetCategory: body.assetCategory as AssetCategory | undefined,
        assetClass: body.assetClass as AssetClass | undefined,
        location: body.location as string | undefined,
        pcgeAssetAccount: body.pcgeAssetAccount as string | undefined,
        pcgeAmortAccount: body.pcgeAmortAccount as string | undefined,
        pcgeChargeAccount: body.pcgeChargeAccount as string | undefined,
        acquisitionDate: body.acquisitionDate as string | undefined,
        acquisitionCostHT: Number(body.acquisitionCostHT),
        residualValue: body.residualValue != null ? Number(body.residualValue) : undefined,
        usefulLifeMonths: body.usefulLifeMonths != null ? Number(body.usefulLifeMonths) : undefined,
        depreciationStartDate: body.depreciationStartDate as string | undefined,
        postAcquisitionEntry: body.postAcquisitionEntry as boolean | undefined,
      });
      return NextResponse.json({ ok: true, asset });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'generate_schedule' && body.assetId) {
    try {
      const count = await generateDepreciationSchedule(
        admin,
        session.userId,
        access.companyId,
        String(body.assetId),
      );
      return NextResponse.json({ ok: true, generated: count });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'post_depreciation' && body.scheduleId) {
    try {
      const schedule = await postDepreciationSchedule(
        admin,
        session.userId,
        access.companyId,
        String(body.scheduleId),
      );
      if (!schedule) return apiNotFound('Ligne d\'amortissement introuvable.');
      return NextResponse.json({ ok: true, schedule });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'post_all') {
    try {
      const result = await postAllPlannedDepreciation(
        admin,
        session.userId,
        access.companyId,
        body.periodKey as string | undefined,
      );
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
