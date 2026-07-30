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
  advanceDebtCase,
  buildDebtDashboard,
  rowToCase,
  sendClientPaymentReminder,
  STAGE_LABELS,
  syncOverdueInvoices,
} from '@/app/lib/atlas-debt-collection-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { recordNotification } from '@/app/lib/atlas-notifications-engine';

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

  const view = url.searchParams.get('view');

  if (view === 'dashboard') {
    try {
      const dashboard = await buildDebtDashboard(admin, session.userId, access.companyId);
      return NextResponse.json({ ok: true, ...dashboard, stageLabels: STAGE_LABELS });
    } catch (err) {
      return mapDbError(err as Error, { cases: [], totalDue: 0, aging: [], riskProfiles: [], followUps: [], stats: {} });
    }
  }

  const { data, error } = await admin
    .from('zafirix_debt_collection_cases')
    .select('*')
    .eq('company_id', access.companyId)
    .eq('user_id', session.userId)
    .order('days_overdue', { ascending: false })
    .limit(100);

  if (error) return mapDbError(error, { cases: [], totalDue: 0, stageLabels: STAGE_LABELS });

  const cases = (data ?? []).map((r) => rowToCase(r as Record<string, unknown>));
  const totalDue = cases
    .filter((c) => c.stage !== 'paid' && c.stage !== 'closed')
    .reduce((s, c) => s + (c.outstandingAmount ?? c.amountDue), 0);

  return NextResponse.json({ ok: true, cases, totalDue, stageLabels: STAGE_LABELS });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    action?: 'create' | 'advance' | 'sync_overdue' | 'send_reminder';
    companyId?: string;
    invoiceId?: string;
    clientName?: string;
    amountDue?: number;
    id?: string;
    notes?: string;
    channels?: ('email' | 'whatsapp')[];
  };

  if (!body.companyId) {
    return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  if (body.action === 'sync_overdue') {
    try {
      const result = await syncOverdueInvoices(admin, session.userId, access.companyId);
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return mapDbError(err as Error, { created: 0, updated: 0 });
    }
  }

  if (body.action === 'create' && body.clientName) {
    const { data, error } = await admin
      .from('zafirix_debt_collection_cases')
      .insert({
        user_id: session.userId,
        company_id: access.companyId,
        invoice_id: body.invoiceId ?? null,
        client_name: body.clientName,
        amount_due: body.amountDue ?? 0,
        outstanding_amount: body.amountDue ?? 0,
        stage: 'reminder_1',
        aging_bucket: 'current',
        next_action_at: new Date().toISOString(),
        notes: body.notes ?? null,
      })
      .select('*')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, case: rowToCase(data as Record<string, unknown>) });
  }

  if (body.action === 'advance' && body.id) {
    const updated = await advanceDebtCase(admin, session.userId, access.companyId, body.id, body.notes);
    if (!updated) return apiNotFound('Dossier introuvable.');

    await recordNotification(
      admin,
      {
        userId: session.userId,
        companyId: access.companyId,
        channel: 'in_app',
        category: 'debt_collection',
        title: `Recouvrement — ${updated.clientName} → ${updated.stageLabel ?? STAGE_LABELS[updated.stage]}`,
        body: `Montant dû : ${(updated.outstandingAmount ?? updated.amountDue).toLocaleString('fr-MA')} MAD`,
        entityType: 'debt_case',
        entityId: body.id,
      },
      'sent',
    );

    return NextResponse.json({ ok: true, case: updated });
  }

  if (body.action === 'send_reminder' && body.id) {
    const { data: row } = await admin
      .from('zafirix_debt_collection_cases')
      .select('*')
      .eq('id', body.id)
      .eq('user_id', session.userId)
      .single();
    if (!row) return apiNotFound('Dossier introuvable.');

    const caseRow = rowToCase(row as Record<string, unknown>);
    const result = await sendClientPaymentReminder(admin, {
      userId: session.userId,
      companyId: access.companyId,
      caseRow,
      channels: body.channels,
    });
    return NextResponse.json({ ok: true, sent: result.sent, case: caseRow });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
