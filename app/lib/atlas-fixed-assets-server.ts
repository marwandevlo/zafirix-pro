/**
 * Corporate Real Estate & Asset Ledger — register, depreciation schedules, GL posting.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { persistJournalLines } from '@/app/lib/atlas-documents-accounting-engine';
import type {
  AssetCategory,
  AssetClass,
  AssetStatus,
  AtlasAssetEvent,
  AtlasDepreciationSchedule,
  AtlasFixedAsset,
  FixedAssetsDashboardSummary,
  FixedAssetsPayload,
  ScheduleStatus,
} from '@/app/types/atlas-fixed-assets';
import {
  ASSET_CATEGORY_LABELS,
  ASSET_CLASS_LABELS,
  ASSET_STATUS_LABELS,
  DEFAULT_PCGE_BY_CATEGORY,
  SCHEDULE_STATUS_LABELS,
} from '@/app/types/atlas-fixed-assets';

export {
  ASSET_CATEGORY_LABELS,
  ASSET_CLASS_LABELS,
  ASSET_STATUS_LABELS,
  DEFAULT_PCGE_BY_CATEGORY,
  SCHEDULE_STATUS_LABELS,
};

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(ymd: string, months: number): { year: number; month: number } {
  const d = new Date(`${ymd}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function periodBounds(year: number, month: number): { periodKey: string; start: string; end: string } {
  const last = lastDayOfMonth(year, month);
  return {
    periodKey: `${year}-${pad2(month)}`,
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(last)}`,
  };
}

export function computeMonthlyDepreciation(
  acquisitionCost: number,
  residualValue: number,
  usefulLifeMonths: number,
): number {
  if (usefulLifeMonths <= 0) return 0;
  const depreciable = Math.max(0, acquisitionCost - residualValue);
  return roundMad(depreciable / usefulLifeMonths);
}

export function rowToAsset(row: Record<string, unknown>): AtlasFixedAsset {
  const cost = Number(row.acquisition_cost_ht ?? 0);
  const residual = Number(row.residual_value ?? 0);
  const life = Number(row.useful_life_months ?? 60);
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    assetCode: String(row.asset_code ?? ''),
    name: String(row.name ?? ''),
    description: (row.description as string | null) ?? null,
    assetCategory: row.asset_category as AssetCategory,
    assetClass: row.asset_class as AssetClass,
    location: (row.location as string | null) ?? null,
    pcgeAssetAccount: String(row.pcge_asset_account ?? '234000'),
    pcgeAmortAccount: String(row.pcge_amort_account ?? '283400'),
    pcgeChargeAccount: String(row.pcge_charge_account ?? '619300'),
    acquisitionDate: String(row.acquisition_date ?? ''),
    acquisitionCostHT: cost,
    residualValue: residual,
    usefulLifeMonths: life,
    depreciationMethod: 'linear',
    depreciationStartDate: (row.depreciation_start_date as string | null) ?? null,
    accumulatedDepreciation: Number(row.accumulated_depreciation ?? 0),
    bookValue: Number(row.book_value ?? cost),
    status: row.status as AssetStatus,
    sourceDocumentId: (row.source_document_id as string | null) ?? null,
    sourceInvoiceId: (row.source_invoice_id as string | null) ?? null,
    disposalDate: (row.disposal_date as string | null) ?? null,
    disposalAmount: row.disposal_amount != null ? Number(row.disposal_amount) : null,
    monthlyDepreciation: computeMonthlyDepreciation(cost, residual, life),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function rowToSchedule(
  row: Record<string, unknown>,
  asset?: AtlasFixedAsset,
): AtlasDepreciationSchedule {
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    assetName: asset?.name,
    assetCode: asset?.assetCode,
    periodKey: String(row.period_key ?? ''),
    periodStart: String(row.period_start ?? ''),
    periodEnd: String(row.period_end ?? ''),
    openingNbv: Number(row.opening_nbv ?? 0),
    depreciationAmount: Number(row.depreciation_amount ?? 0),
    closingNbv: Number(row.closing_nbv ?? 0),
    status: row.status as ScheduleStatus,
    accountingEntryIds: Array.isArray(row.accounting_entry_ids)
      ? (row.accounting_entry_ids as string[]).map(String)
      : [],
    postedAt: (row.posted_at as string | null) ?? null,
    pcgeChargeAccount: asset?.pcgeChargeAccount,
    pcgeAmortAccount: asset?.pcgeAmortAccount,
  };
}

export function rowToEvent(row: Record<string, unknown>): AtlasAssetEvent {
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    eventType: String(row.event_type ?? ''),
    title: String(row.title ?? ''),
    body: (row.body as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

async function logAssetEvent(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  assetId: string,
  eventType: string,
  title: string,
  body?: string,
): Promise<void> {
  await admin.from('zafirix_asset_events').insert({
    user_id: userId,
    company_id: companyId,
    asset_id: assetId,
    event_type: eventType,
    title,
    body: body ?? null,
  });
}

async function nextAssetCode(
  admin: SupabaseClient,
  companyId: string,
  category: AssetCategory,
): Promise<string> {
  const prefix = category === 'real_estate' ? 'IMMO' : 'ACT';
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-`;

  const { data } = await admin
    .from('zafirix_fixed_assets')
    .select('asset_code')
    .eq('company_id', companyId)
    .like('asset_code', `${pattern}%`)
    .order('asset_code', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data?.[0]?.asset_code) {
    const parts = String(data[0].asset_code).split('-');
    const last = parseInt(parts[parts.length - 1] ?? '0', 10);
    if (!Number.isNaN(last)) seq = last + 1;
  }
  return `${pattern}${String(seq).padStart(4, '0')}`;
}

function buildSummary(
  assets: AtlasFixedAsset[],
  schedules: AtlasDepreciationSchedule[],
): FixedAssetsDashboardSummary {
  const active = assets.filter((a) => a.status === 'active');
  return {
    totalAssets: assets.length,
    activeAssets: active.length,
    totalGrossValue: roundMad(assets.reduce((s, a) => s + a.acquisitionCostHT, 0)),
    totalAccumulatedDepreciation: roundMad(assets.reduce((s, a) => s + a.accumulatedDepreciation, 0)),
    totalBookValue: roundMad(assets.reduce((s, a) => s + a.bookValue, 0)),
    plannedSchedules: schedules.filter((s) => s.status === 'planned').length,
    postedSchedules: schedules.filter((s) => s.status === 'posted').length,
    realEstateCount: assets.filter((a) => a.assetCategory === 'real_estate').length,
  };
}

export async function getFixedAssetsPayload(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<FixedAssetsPayload> {
  const { data: assetRows, error } = await admin
    .from('zafirix_fixed_assets')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('acquisition_date', { ascending: false });

  if (error) throw new Error(error.message);

  const assets = (assetRows ?? []).map((r) => rowToAsset(r as Record<string, unknown>));
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const { data: scheduleRows } = await admin
    .from('zafirix_depreciation_schedules')
    .select('*')
    .eq('company_id', companyId)
    .order('period_start', { ascending: false })
    .limit(500);

  const schedules = (scheduleRows ?? []).map((r) =>
    rowToSchedule(r as Record<string, unknown>, assetMap.get(String(r.asset_id))),
  );

  const { data: eventRows } = await admin
    .from('zafirix_asset_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    assets,
    schedules,
    events: (eventRows ?? []).map((r) => rowToEvent(r as Record<string, unknown>)),
    summary: buildSummary(assets, schedules),
  };
}

export async function createFixedAsset(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    name: string;
    assetCode?: string;
    description?: string;
    assetCategory?: AssetCategory;
    assetClass?: AssetClass;
    location?: string;
    pcgeAssetAccount?: string;
    pcgeAmortAccount?: string;
    pcgeChargeAccount?: string;
    acquisitionDate?: string;
    acquisitionCostHT: number;
    residualValue?: number;
    usefulLifeMonths?: number;
    depreciationStartDate?: string;
    postAcquisitionEntry?: boolean;
  },
): Promise<AtlasFixedAsset> {
  const category = input.assetCategory ?? 'equipment';
  const defaults = DEFAULT_PCGE_BY_CATEGORY[category];
  const cost = roundMad(Math.max(0, input.acquisitionCostHT));
  const residual = roundMad(Math.max(0, input.residualValue ?? 0));
  const life = Math.max(1, input.usefulLifeMonths ?? 60);
  const acqDate = input.acquisitionDate ?? new Date().toISOString().slice(0, 10);
  const startDate = input.depreciationStartDate ?? acqDate;
  const assetCode = input.assetCode?.trim() || (await nextAssetCode(admin, companyId, category));

  const { data: row, error } = await admin
    .from('zafirix_fixed_assets')
    .insert({
      user_id: userId,
      company_id: companyId,
      asset_code: assetCode,
      name: input.name,
      description: input.description ?? null,
      asset_category: category,
      asset_class: input.assetClass ?? 'corporel',
      location: input.location ?? null,
      pcge_asset_account: input.pcgeAssetAccount ?? defaults.asset,
      pcge_amort_account: input.pcgeAmortAccount ?? defaults.amort,
      pcge_charge_account: input.pcgeChargeAccount ?? defaults.charge,
      acquisition_date: acqDate,
      acquisition_cost_ht: cost,
      residual_value: residual,
      useful_life_months: life,
      depreciation_start_date: startDate,
      accumulated_depreciation: 0,
      book_value: cost,
      status: 'active',
    })
    .select('*')
    .single();

  if (error || !row) throw new Error(error?.message ?? 'asset_create_failed');

  const asset = rowToAsset(row as Record<string, unknown>);
  const assetId = asset.id;

  await logAssetEvent(admin, userId, companyId, assetId, 'created', `Immobilisation ${assetCode} — ${input.name}`);

  if (input.postAcquisitionEntry && cost > 0) {
    const pcgeAsset = input.pcgeAssetAccount ?? defaults.asset;
    const result = await persistJournalLines(admin, userId, companyId, [
      {
        date: acqDate,
        libelle: `Acquisition immo — ${input.name}`,
        compte: pcgeAsset,
        debit: cost,
        credit: 0,
        source_document_id: assetId,
        generated_by: 'fixed_assets',
        validation_status: 'draft',
      },
      {
        date: acqDate,
        libelle: `Acquisition immo — ${input.name}`,
        compte: '514100',
        debit: 0,
        credit: cost,
        source_document_id: assetId,
        generated_by: 'fixed_assets',
        validation_status: 'draft',
      },
    ]);
    if (result.ok) {
      await logAssetEvent(
        admin,
        userId,
        companyId,
        assetId,
        'acquisition_posted',
        'Écriture d\'acquisition comptabilisée',
        `Comptes ${pcgeAsset} / 514100`,
      );
    }
  }

  await generateDepreciationSchedule(admin, userId, companyId, assetId);
  return asset;
}

export async function generateDepreciationSchedule(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  assetId: string,
): Promise<number> {
  const { data: row } = await admin
    .from('zafirix_fixed_assets')
    .select('*')
    .eq('id', assetId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) throw new Error('asset_not_found');

  const asset = rowToAsset(row as Record<string, unknown>);
  if (asset.status === 'disposed') return 0;

  const startYmd = asset.depreciationStartDate ?? asset.acquisitionDate;
  const monthly = computeMonthlyDepreciation(
    asset.acquisitionCostHT,
    asset.residualValue,
    asset.usefulLifeMonths,
  );

  let nbv = asset.acquisitionCostHT;
  let inserted = 0;

  for (let i = 0; i < asset.usefulLifeMonths && nbv > asset.residualValue + 0.01; i++) {
    const { year, month } = addMonths(startYmd, i);
    const { periodKey, start, end } = periodBounds(year, month);

    const { data: existing } = await admin
      .from('zafirix_depreciation_schedules')
      .select('id, status')
      .eq('asset_id', assetId)
      .eq('period_key', periodKey)
      .maybeSingle();

    if (existing) continue;

    const openingNbv = roundMad(nbv);
    const amount = roundMad(Math.min(monthly, openingNbv - asset.residualValue));
    if (amount <= 0) break;

    const closingNbv = roundMad(openingNbv - amount);
    nbv = closingNbv;

    const { error } = await admin.from('zafirix_depreciation_schedules').insert({
      user_id: userId,
      company_id: companyId,
      asset_id: assetId,
      period_key: periodKey,
      period_start: start,
      period_end: end,
      opening_nbv: openingNbv,
      depreciation_amount: amount,
      closing_nbv: closingNbv,
      status: 'planned',
    });

    if (!error) inserted++;
  }

  if (inserted > 0) {
    await logAssetEvent(
      admin,
      userId,
      companyId,
      assetId,
      'schedule_generated',
      `${inserted} ligne(s) d'amortissement planifiées`,
    );
  }

  return inserted;
}

export async function postDepreciationSchedule(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  scheduleId: string,
): Promise<AtlasDepreciationSchedule | null> {
  const { data: schedRow } = await admin
    .from('zafirix_depreciation_schedules')
    .select('*')
    .eq('id', scheduleId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!schedRow) return null;
  if (String(schedRow.status) === 'posted') {
    const { data: assetRow } = await admin
      .from('zafirix_fixed_assets')
      .select('*')
      .eq('id', String(schedRow.asset_id))
      .maybeSingle();
    return rowToSchedule(
      schedRow as Record<string, unknown>,
      assetRow ? rowToAsset(assetRow as Record<string, unknown>) : undefined,
    );
  }

  const { data: assetRow } = await admin
    .from('zafirix_fixed_assets')
    .select('*')
    .eq('id', String(schedRow.asset_id))
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!assetRow) return null;

  const asset = rowToAsset(assetRow as Record<string, unknown>);
  const amount = Number(schedRow.depreciation_amount ?? 0);
  if (amount <= 0) return null;

  const entryDate = String(schedRow.period_end ?? schedRow.period_start);
  const libelle = `Dot. amort. — ${asset.name} (${schedRow.period_key})`;

  const result = await persistJournalLines(admin, userId, companyId, [
    {
      date: entryDate,
      libelle,
      compte: asset.pcgeChargeAccount,
      debit: amount,
      credit: 0,
      source_document_id: asset.id,
      generated_by: 'fixed_assets',
      validation_status: 'draft',
    },
    {
      date: entryDate,
      libelle,
      compte: asset.pcgeAmortAccount,
      debit: 0,
      credit: amount,
      source_document_id: asset.id,
      generated_by: 'fixed_assets',
      validation_status: 'draft',
    },
  ]);

  if (!result.ok) throw new Error(result.error);

  const now = new Date().toISOString();
  await admin
    .from('zafirix_depreciation_schedules')
    .update({
      status: 'posted',
      accounting_entry_ids: result.ids,
      posted_at: now,
      updated_at: now,
    })
    .eq('id', scheduleId);

  const newAccum = roundMad(asset.accumulatedDepreciation + amount);
  const newBook = roundMad(Math.max(asset.residualValue, asset.acquisitionCostHT - newAccum));
  const newStatus: AssetStatus = newBook <= asset.residualValue + 0.01 ? 'fully_depreciated' : 'active';

  await admin
    .from('zafirix_fixed_assets')
    .update({
      accumulated_depreciation: newAccum,
      book_value: newBook,
      status: newStatus,
      updated_at: now,
    })
    .eq('id', asset.id);

  await logAssetEvent(
    admin,
    userId,
    companyId,
    asset.id,
    'depreciation_posted',
    `Amortissement ${schedRow.period_key} — ${amount.toLocaleString('fr-MA')} MAD`,
    `Écritures GL : ${asset.pcgeChargeAccount} / ${asset.pcgeAmortAccount}`,
  );

  const { data: updated } = await admin
    .from('zafirix_depreciation_schedules')
    .select('*')
    .eq('id', scheduleId)
    .single();

  return rowToSchedule(updated as Record<string, unknown>, asset);
}

export async function postAllPlannedDepreciation(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  periodKey?: string,
): Promise<{ posted: number; errors: string[] }> {
  let query = admin
    .from('zafirix_depreciation_schedules')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'planned');

  if (periodKey) query = query.eq('period_key', periodKey);

  const { data: rows } = await query.limit(100);
  let posted = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    try {
      const result = await postDepreciationSchedule(admin, userId, companyId, String(row.id));
      if (result) posted++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'post_failed');
    }
  }

  return { posted, errors };
}
