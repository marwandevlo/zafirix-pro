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
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  createContract,
  getContractsPayload,
  renewContract,
  scanAndAlertContractRenewals,
  syncContractsFromLegalDocuments,
  terminateContract,
} from '@/app/lib/atlas-contracts-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { ContractStatus, ContractType, ContractPartyRole } from '@/app/types/atlas-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const statusParam = url.searchParams.get('status') ?? 'all';
  const status = statusParam as ContractStatus | 'all';
  const sync = url.searchParams.get('sync') !== 'false';

  try {
    const payload = await getContractsPayload(admin, session.userId, access.companyId, { status, sync });
    return NextResponse.json({
      ok: true,
      ...payload,
      statusLabels: CONTRACT_STATUS_LABELS,
      typeLabels: CONTRACT_TYPE_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'contracts_load_failed';
    return mapDbError({ message: msg }, { contracts: [], summary: {}, events: [] });
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

  if (action === 'sync') {
    const imported = await syncContractsFromLegalDocuments(admin, session.userId, access.companyId);
    return NextResponse.json({ ok: true, imported });
  }

  if (action === 'trigger_alerts') {
    const result = await scanAndAlertContractRenewals(admin, session.userId, access.companyId);
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'create' && body.title) {
    try {
      const contract = await createContract(admin, session.userId, access.companyId, {
        title: String(body.title),
        reference: body.reference as string | undefined,
        contractType: body.contractType as ContractType | undefined,
        effectiveDate: body.effectiveDate as string | undefined,
        expiryDate: body.expiryDate as string | undefined,
        renewalDate: body.renewalDate as string | undefined,
        renewalTerms: body.renewalTerms as string | undefined,
        autoRenew: body.autoRenew as boolean | undefined,
        renewalNoticeDays: body.renewalNoticeDays as number | undefined,
        contractValue: body.contractValue as number | undefined,
        currency: body.currency as string | undefined,
        notes: body.notes as string | undefined,
        parties: (body.parties as Array<{ partyName: string; partyRole?: ContractPartyRole; contactEmail?: string; contactPhone?: string }> | undefined),
        attachments: body.attachments as Array<{ fileName: string; fileUrl?: string; documentType?: string }> | undefined,
      });
      return NextResponse.json({ ok: true, contract });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'terminate' && body.contractId) {
    const contract = await terminateContract(
      admin,
      session.userId,
      access.companyId,
      String(body.contractId),
      body.reason as string | undefined,
    );
    if (!contract) return apiNotFound('Contrat introuvable.');
    return NextResponse.json({ ok: true, contract });
  }

  if (action === 'renew' && body.contractId) {
    const contract = await renewContract(admin, session.userId, access.companyId, String(body.contractId), {
      newExpiryDate: body.newExpiryDate as string | undefined,
      newRenewalDate: body.newRenewalDate as string | undefined,
      notes: body.notes as string | undefined,
    });
    if (!contract) return apiNotFound('Contrat introuvable.');
    return NextResponse.json({ ok: true, contract });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
