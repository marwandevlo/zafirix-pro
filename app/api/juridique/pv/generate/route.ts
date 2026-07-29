import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import {
  buildMoroccanLegalIdentifiers,
  generatePvAgo,
  generatePvAge,
  juridiqueCompanyToLegalIds,
} from '@/app/lib/atlas-juridique-pv';
import { getIsDraftForYear } from '@/app/lib/atlas-is-server';
import { asRecord } from '@/app/lib/atlas-json';
import type { PvAgeResolutionType, PvAssemblyType } from '@/app/types/atlas-juridique-pv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GeneratePvBody = {
  assemblyType: PvAssemblyType;
  companyId?: string;
  company?: {
    raisonSociale: string;
    formeJuridique: string;
    if_fiscal: string;
    ice: string;
    rc: string;
    adresse: string;
    ville: string;
    capitalSocial?: string;
  };
  ago?: {
    dateAssemblee: string;
    exercice: string;
    resultatNet: string;
    affectation: string;
    dirigeant: string;
    participants?: string;
    lieu?: string;
  };
  age?: {
    dateAssemblee: string;
    ordreDuJour: string;
    resolutions: string;
    resolutionType: PvAgeResolutionType;
    dirigeant: string;
    participants?: string;
    lieu?: string;
    cedant?: string;
    cessionnaire?: string;
    nombreParts?: string;
    prixCession?: string;
    capitalActuel?: string;
    capitalNouveau?: string;
  };
};

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as GeneratePvBody;
  const assemblyType = body.assemblyType;

  if (assemblyType !== 'ago' && assemblyType !== 'age') {
    return NextResponse.json({ error: 'invalid_assembly_type' }, { status: 400 });
  }

  try {
    let legalIds;
    if (body.companyId) {
      const { data: row, error } = await ctx.db
        .from('atlas_companies')
        .select('name, legal_name, trade_name, legal_form, if_fiscal, ice, rc, address, city, company_json')
        .eq('id', body.companyId)
        .eq('user_id', ctx.userId)
        .maybeSingle();
      if (error || !row) return NextResponse.json({ error: 'company_not_found' }, { status: 404 });

      const r = row as Record<string, unknown>;
      const json = asRecord(r.company_json) ?? {};
      legalIds = juridiqueCompanyToLegalIds(
        {
          id: 0,
          raisonSociale: String(r.trade_name ?? r.legal_name ?? r.name ?? ''),
          formeJuridique: String(r.legal_form ?? 'SARL'),
          if_fiscal: String(r.if_fiscal ?? json.if_fiscal ?? ''),
          ice: String(r.ice ?? json.ice ?? ''),
          rc: String(r.rc ?? json.rc ?? ''),
          cnss: '',
          adresse: String(r.address ?? json.adresse ?? ''),
          ville: String(r.city ?? json.ville ?? ''),
          telephone: '',
          email: '',
          activite: '',
        },
        json,
      );
    } else if (body.company) {
      legalIds = buildMoroccanLegalIdentifiers(
        {
          id: 0,
          raisonSociale: body.company.raisonSociale,
          formeJuridique: body.company.formeJuridique,
          if_fiscal: body.company.if_fiscal,
          ice: body.company.ice,
          rc: body.company.rc,
          cnss: '',
          adresse: body.company.adresse,
          ville: body.company.ville,
          telephone: '',
          email: '',
          activite: '',
        },
        { capitalSocial: body.company.capitalSocial },
      );
    } else {
      return NextResponse.json({ error: 'company_required' }, { status: 400 });
    }

    if (assemblyType === 'ago') {
      if (!body.ago) return NextResponse.json({ error: 'ago_fields_required' }, { status: 400 });
      const doc = generatePvAgo({ company: legalIds, ...body.ago });
      return NextResponse.json({ document: doc });
    }

    if (!body.age) return NextResponse.json({ error: 'age_fields_required' }, { status: 400 });
    const doc = generatePvAge({ company: legalIds, ...body.age });
    return NextResponse.json({ document: doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET — résultat net IS pour pré-remplissage PV AGO. */
export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  const fiscalYear = Number(request.nextUrl.searchParams.get('fiscalYear') ?? new Date().getFullYear() - 1);

  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const draft = await getIsDraftForYear(ctx.db, ctx.userId, companyId, fiscalYear);
    if (!draft) {
      return NextResponse.json({ resultatNet: null, fiscalYear, message: 'Aucun brouillon IS pour cet exercice.' });
    }
    return NextResponse.json({
      resultatNet: draft.taxableResult,
      fiscalYear,
      revenueHT: draft.revenueHT,
      isDue: draft.isDue,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
