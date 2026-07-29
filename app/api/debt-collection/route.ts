import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { recordNotification } from '@/app/lib/atlas-notifications-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAGE_LABELS: Record<string, string> = {
  reminder_1: 'Relance 1',
  reminder_2: 'Relance 2',
  formal_notice: 'Mise en demeure',
  legal: 'Contentieux',
  closed: 'Clôturé',
  paid: 'Payé',
};

function rowToCase(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    invoiceId: (row.invoice_id as string | null) ?? null,
    clientName: String(row.client_name ?? ''),
    amountDue: Number(row.amount_due ?? 0),
    stage: row.stage,
    stageLabel: STAGE_LABELS[String(row.stage)] ?? String(row.stage),
    lastContactAt: (row.last_contact_at as string | null) ?? null,
    nextActionAt: (row.next_action_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'company_id_required' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('zafirix_debt_collection_cases')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cases = (data ?? []).map((r) => rowToCase(r as Record<string, unknown>));
  const totalDue = cases.filter((c) => c.stage !== 'paid' && c.stage !== 'closed').reduce((s, c) => s + c.amountDue, 0);

  return NextResponse.json({ ok: true, cases, totalDue, stageLabels: STAGE_LABELS });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json()) as {
    action?: 'create' | 'advance' | 'sync_overdue';
    companyId?: string;
    invoiceId?: string;
    clientName?: string;
    amountDue?: number;
    id?: string;
    notes?: string;
  };

  const admin = getSupabaseServiceRoleClient();
  const companyId = body.companyId;
  if (!companyId) return NextResponse.json({ error: 'company_id_required' }, { status: 400 });

  if (body.action === 'sync_overdue') {
    const today = new Date().toISOString().slice(0, 10);
    const { data: invoices } = await admin
      .from('atlas_invoices')
      .select('id, client_name, total_ttc, due_date, status')
      .eq('company_id', companyId)
      .neq('status', 'paid')
      .lt('due_date', today);

    let created = 0;
    for (const inv of invoices ?? []) {
      const { data: existing } = await admin
        .from('zafirix_debt_collection_cases')
        .select('id')
        .eq('invoice_id', inv.id)
        .maybeSingle();
      if (existing) continue;

      await admin.from('zafirix_debt_collection_cases').insert({
        user_id: session.userId,
        company_id: companyId,
        invoice_id: inv.id,
        client_name: inv.client_name,
        amount_due: inv.total_ttc,
        stage: 'reminder_1',
        next_action_at: new Date().toISOString(),
      });
      created++;
    }
    return NextResponse.json({ ok: true, created });
  }

  if (body.action === 'create' && body.clientName) {
    const { data, error } = await admin
      .from('zafirix_debt_collection_cases')
      .insert({
        user_id: session.userId,
        company_id: companyId,
        invoice_id: body.invoiceId ?? null,
        client_name: body.clientName,
        amount_due: body.amountDue ?? 0,
        stage: 'reminder_1',
        next_action_at: new Date().toISOString(),
        notes: body.notes ?? null,
      })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, case: rowToCase(data as Record<string, unknown>) });
  }

  if (body.action === 'advance' && body.id) {
    const stages = ['reminder_1', 'reminder_2', 'formal_notice', 'legal', 'closed'] as const;
    const { data: current } = await admin
      .from('zafirix_debt_collection_cases')
      .select('*')
      .eq('id', body.id)
      .single();
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const idx = stages.indexOf(current.stage as typeof stages[number]);
    const nextStage = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : current.stage;

    const { data, error } = await admin
      .from('zafirix_debt_collection_cases')
      .update({
        stage: nextStage,
        last_contact_at: new Date().toISOString(),
        next_action_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        notes: body.notes ?? current.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordNotification(admin, {
      userId: session.userId,
      companyId,
      channel: 'in_app',
      category: 'debt_collection',
      title: `Recouvrement — ${current.client_name} → ${STAGE_LABELS[nextStage]}`,
      body: `Montant dû : ${Number(current.amount_due).toLocaleString('fr-MA')} MAD`,
      entityType: 'debt_case',
      entityId: body.id,
    }, 'sent');

    return NextResponse.json({ ok: true, case: rowToCase(data as Record<string, unknown>) });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
