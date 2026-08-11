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
  buildPpDashboard,
  currentFiscalYear,
  ensureIndividualProfile,
  rowToIndividualProfile,
  rowToPpLedger,
} from '@/app/lib/atlas-individual-tax-server';
import type { PpLedgerEntryType, PpTaxRegime } from '@/app/types/atlas-individual-tax';
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
    const dashboard = await buildPpDashboard(admin, {
      userId: session.userId,
      companyId: access.companyId,
      fiscalYear,
    });
    return NextResponse.json({ ok: true, ...dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pp_dashboard_failed';
    console.warn('[personne-physique] GET', message);
    if (isMissingTableError(message)) {
      return mapDbError({ message }, {
        profile: null,
        fiscalYear,
        regime: 'rnr',
        chiffreAffairesMad: 0,
        chargesDeductiblesMad: 0,
        chargesNonDeductiblesMad: 0,
        beneficeNetImposableMad: 0,
        indicativeIrMad: 0,
        indicativeEffectiveRatePct: 0,
        revenueCount: 0,
        expenseCount: 0,
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
    taxRegime?: PpTaxRegime;
    displayName?: string;
    entryType?: PpLedgerEntryType;
    entryDate?: string;
    amountMad?: number;
    category?: string;
    label?: string;
    deductible?: boolean;
    documentRef?: string;
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
      const profile = await ensureIndividualProfile(admin, {
        userId: session.userId,
        companyId: access.companyId,
        profileType: 'personne_physique',
        fiscalYear,
        taxRegime: body.taxRegime ?? 'rnr',
        displayName: body.displayName,
      });

      const { data, error } = await admin
        .from('zafirix_individual_profiles')
        .update({
          tax_regime: body.taxRegime ?? profile.taxRegime,
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

    if (body.action === 'add_entry') {
      const amount = Number(body.amountMad);
      const entryType = body.entryType;
      if (!entryType || !['revenue', 'expense'].includes(entryType)) {
        return apiBadRequest('missing_fields', 'Type d’écriture invalide.');
      }
      if (!Number.isFinite(amount) || amount < 0) {
        return apiBadRequest('missing_fields', 'Montant invalide.');
      }

      const profile = await ensureIndividualProfile(admin, {
        userId: session.userId,
        companyId: access.companyId,
        profileType: 'personne_physique',
        fiscalYear,
      });

      const entryDate = (body.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const { data, error } = await admin
        .from('zafirix_pp_ledger_entries')
        .insert({
          user_id: session.userId,
          company_id: access.companyId,
          profile_id: profile.id,
          entry_type: entryType,
          entry_date: entryDate,
          amount_mad: amount,
          category: body.category?.trim() || (entryType === 'revenue' ? 'honoraires' : 'divers'),
          label: body.label?.trim() || (entryType === 'revenue' ? 'Produit' : 'Charge'),
          deductible: entryType === 'expense' ? body.deductible !== false : true,
          fiscal_year: fiscalYear,
          document_ref: body.documentRef?.trim() || null,
        })
        .select('*')
        .single();

      if (error) return mapDbError(error);
      return NextResponse.json({ ok: true, entry: rowToPpLedger(data as Record<string, unknown>) });
    }

    return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pp_action_failed';
    console.warn('[personne-physique] POST', message);
    return mapDbError({ message });
  }
}
