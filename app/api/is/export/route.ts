import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import {
  generateIsDeclarationXml,
  isDeclarationXmlFilename,
  validateIsExportForDgi,
} from '@/app/lib/atlas-is-xml';
import {
  computeAndSaveIsDraft,
  getIsDraftById,
  getIsDraftForYear,
  loadCompanyIsExportInfo,
} from '@/app/lib/atlas-is-server';
import { resolveDgiIdentifiantFiscal } from '@/app/lib/atlas-tva-dgi';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  const draftId = request.nextUrl.searchParams.get('draftId')?.trim();
  const fiscalYearParam = request.nextUrl.searchParams.get('fiscalYear');
  const fiscalYear = fiscalYearParam ? Number(fiscalYearParam) : new Date().getFullYear();
  const skipRecompute = request.nextUrl.searchParams.get('recompute') === '0';

  if (!companyId && !draftId) {
    return NextResponse.json(
      { error: 'company_or_draft_required' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const admin = getSupabaseServiceRoleClient();

    let draft = draftId
      ? await getIsDraftById(admin, ctx.userId, draftId)
      : companyId
        ? await getIsDraftForYear(admin, ctx.userId, companyId, fiscalYear)
        : null;

    if (!draft && companyId && !skipRecompute) {
      draft = await computeAndSaveIsDraft(admin, ctx.userId, companyId, fiscalYear);
    }

    if (!draft) {
      return NextResponse.json(
        {
          error: 'draft_not_found',
          message: 'Aucun brouillon IS pour cet exercice. Lancez le calcul IS avant export.',
        },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const resolvedCompanyId = companyId ?? draft.companyId;

    const { data: ownedCompany } = await admin
      .from('atlas_companies')
      .select('id')
      .eq('id', resolvedCompanyId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

    if (!ownedCompany) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const company = await loadCompanyIsExportInfo(admin, resolvedCompanyId);
    if (!company) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const identifiantFiscal = resolveDgiIdentifiantFiscal(company.if_fiscal, company.if_number);
    const validation = validateIsExportForDgi(draft, { identifiantFiscal });
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, message: validation.message },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }

    const raisonSociale =
      company.trade_name?.trim() || company.legal_name?.trim() || company.name?.trim() || '';

    const xml = generateIsDeclarationXml(draft, { identifiantFiscal, raisonSociale });
    const filename = isDeclarationXmlFilename(draft.fiscalYear);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
