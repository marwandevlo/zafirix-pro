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
import {
  assignAgentToInvoice,
  buildCommissionsDashboard,
  createSalesAgent,
  seedDefaultTiers,
  syncCommissionEntries,
  updateCommissionEntryStatus,
} from '@/app/lib/atlas-commissions-server';
import { BASIS_LABELS, STATUS_LABELS, AGENT_TYPE_LABELS } from '@/app/types/atlas-commissions';
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

  const sync = new URL(request.url).searchParams.get('sync') !== 'false';

  try {
    const dashboard = await buildCommissionsDashboard(admin, session.userId, access.companyId, { sync });
    return NextResponse.json({
      ok: true,
      ...dashboard,
      basisLabels: BASIS_LABELS,
      statusLabels: STATUS_LABELS,
      agentTypeLabels: AGENT_TYPE_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'commissions_load_failed';
    return mapDbError({ message: msg }, { agents: [], tiers: [], rules: [], entries: [], performance: [], stats: {} });
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
    const result = await syncCommissionEntries(admin, session.userId, access.companyId);
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'seed_tiers') {
    const count = await seedDefaultTiers(admin, session.userId, access.companyId);
    return NextResponse.json({ ok: true, seeded: count });
  }

  if (action === 'create_agent' && body.name && body.code) {
    try {
      const agent = await createSalesAgent(admin, session.userId, access.companyId, {
        name: String(body.name),
        code: String(body.code),
        email: body.email as string | undefined,
        phone: body.phone as string | undefined,
        tierId: body.tierId as string | undefined,
        agentType: body.agentType as string | undefined,
      });
      return NextResponse.json({ ok: true, agent });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'assign_invoice' && body.invoiceId && body.agentId) {
    await assignAgentToInvoice(
      admin,
      session.userId,
      access.companyId,
      String(body.invoiceId),
      String(body.agentId),
      body.splitPct != null ? Number(body.splitPct) : 100,
    );
    const result = await syncCommissionEntries(admin, session.userId, access.companyId);
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'update_entry_status' && body.entryId && body.status) {
    const ok = await updateCommissionEntryStatus(
      admin,
      session.userId,
      String(body.entryId),
      body.status as 'approved' | 'paid' | 'cancelled',
    );
    if (!ok) return apiBadRequest('update_failed', apiErrorMessageFr('invalid_action'));
    return NextResponse.json({ ok: true });
  }

  if (action === 'create_rule' && body.name) {
    const { data, error } = await admin
      .from('zafirix_commission_rules')
      .insert({
        user_id: session.userId,
        company_id: access.companyId,
        agent_id: (body.agentId as string) ?? null,
        name: String(body.name),
        basis: body.basis ?? 'payment_collected',
        rate_type: body.rateType ?? 'percent',
        rate_value: body.rateValue ?? 5,
        min_amount: body.minAmount ?? 0,
        priority: body.priority ?? 0,
      })
      .select('*')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, rule: data });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
