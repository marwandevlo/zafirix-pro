import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { isMissingTableError, requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import {
  AE_QUARTER_LABELS,
  aeDeclarationDueDate,
  buildAeDashboard,
  currentFiscalYear,
  ensureIndividualProfile,
  quarterFromDate,
  rowToAeDeclaration,
  rowToAeTurnover,
  rowToIndividualProfile,
} from '@/app/lib/atlas-individual-tax-server';
import {
  AE_ACTIVITY_CEILINGS,
  AE_INDICATIVE_TAX_RATE,
  type AeActivityType,
  type AeDeclarationStatus,
} from '@/app/types/atlas-individual-tax';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const params = new URL(request.url).searchParams;
  const companyId = params.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const fiscalYear = Number(params.get('fiscalYear') || currentFiscalYear());
  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  try {
    const dashboard = await buildAeDashboard(admin, {
      userId: session.userId,
      companyId: access.companyId,
      fiscalYear,
    });
    return NextResponse.json({ ok: true, ...dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ae_dashboard_failed';
    console.warn('[auto-entrepreneur] GET', message);
    if (isMissingTableError(message)) {
      return mapDbError({ message }, {
        profile: null,
        fiscalYear,
        annualCaMad: 0,
        annualCeilingMad: 200_000,
        ceilingUsagePct: 0,
        remainingCeilingMad: 200_000,
        invoiceCount: 0,
        currentQuarterCaMad: 0,
        currentQuarter: 1,
        quarters: [],
        complianceStatus: 'conforme',
        complianceLabel: 'Module en cours de déploiement',
        indicativeTaxRatePct: 1,
        indicativeAnnualTaxMad: 0,
        entries: [],
      });
    }
    return mapDbError({ message }, { entries: [] });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    action?: string;
    fiscalYear?: number;
    activityType?: AeActivityType;
    displayName?: string;
    entryDate?: string;
    amountMad?: number;
    label?: string;
    clientName?: string;
    invoiceRef?: string;
    quarter?: number;
    status?: AeDeclarationStatus;
    notes?: string;
  };

  if (!body.companyId || !body.action) {
    return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const fiscalYear = body.fiscalYear ?? currentFiscalYear();

  try {
    if (body.action === 'update_profile') {
      const activityType = body.activityType ?? 'services';
      const profile = await ensureIndividualProfile(admin, {
        userId: session.userId,
        companyId: access.companyId,
        profileType: 'auto_entrepreneur',
        fiscalYear,
        activityType,
        displayName: body.displayName,
      });

      const { data, error } = await admin
        .from('zafirix_individual_profiles')
        .update({
          activity_type: activityType,
          annual_ceiling_mad: AE_ACTIVITY_CEILINGS[activityType],
          display_name: body.displayName?.trim() || profile.displayName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
        .eq('user_id', session.userId)
        .select('*')
        .single();

      if (error) return mapDbError(error);
      return NextResponse.json({
        ok: true,
        profile: rowToIndividualProfile(data as Record<string, unknown>),
      });
    }

    if (body.action === 'add_turnover') {
      const amount = Number(body.amountMad);
      if (!Number.isFinite(amount) || amount < 0) {
        return apiBadRequest('missing_fields', 'Montant CA invalide.');
      }
      const entryDate = (body.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const quarter = (body.quarter && body.quarter >= 1 && body.quarter <= 4
        ? body.quarter
        : quarterFromDate(entryDate)) as 1 | 2 | 3 | 4;

      const profile = await ensureIndividualProfile(admin, {
        userId: session.userId,
        companyId: access.companyId,
        profileType: 'auto_entrepreneur',
        fiscalYear,
      });

      const { data, error } = await admin
        .from('zafirix_ae_turnover_entries')
        .insert({
          user_id: session.userId,
          company_id: access.companyId,
          profile_id: profile.id,
          entry_date: entryDate,
          amount_mad: amount,
          label: body.label?.trim() || 'Encaissement CA',
          client_name: body.clientName?.trim() || null,
          invoice_ref: body.invoiceRef?.trim() || null,
          quarter,
          fiscal_year: fiscalYear,
        })
        .select('*')
        .single();

      if (error) return mapDbError(error);
      return NextResponse.json({ ok: true, entry: rowToAeTurnover(data as Record<string, unknown>) });
    }

    if (body.action === 'mark_declaration') {
      const quarter = Number(body.quarter) as 1 | 2 | 3 | 4;
      if (![1, 2, 3, 4].includes(quarter)) {
        return apiBadRequest('missing_fields', 'Trimestre invalide.');
      }
      const status = body.status ?? 'declared';
      const dashboard = await buildAeDashboard(admin, {
        userId: session.userId,
        companyId: access.companyId,
        fiscalYear,
      });
      const qSummary = dashboard.quarters.find((q) => q.quarter === quarter);
      const ca = qSummary?.caMad ?? 0;
      const rate = AE_INDICATIVE_TAX_RATE[dashboard.profile?.activityType ?? 'services'];
      const taxDue = Math.round(ca * rate * 100) / 100;

      const { data, error } = await admin
        .from('zafirix_ae_quarterly_declarations')
        .upsert(
          {
            user_id: session.userId,
            company_id: access.companyId,
            fiscal_year: fiscalYear,
            quarter,
            declared_ca_mad: ca,
            tax_due_mad: taxDue,
            status,
            due_date: aeDeclarationDueDate(fiscalYear, quarter),
            declared_at: status === 'pending' ? null : new Date().toISOString(),
            notes: body.notes?.trim() || `${AE_QUARTER_LABELS[quarter]} — suivi Zafirix`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,company_id,fiscal_year,quarter' },
        )
        .select('*')
        .single();

      if (error) return mapDbError(error);
      return NextResponse.json({
        ok: true,
        declaration: rowToAeDeclaration(data as Record<string, unknown>),
      });
    }

    return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ae_action_failed';
    console.warn('[auto-entrepreneur] POST', message);
    return mapDbError({ message });
  }
}
