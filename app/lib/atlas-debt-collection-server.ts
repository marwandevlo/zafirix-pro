/**
 * Smart debt collection — aging, risk profiles, automated client reminders.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  debtDedupeKey,
  enqueueManagerAlert,
  enqueueNotification,
  invoiceDedupeKey,
  resolveManagerContacts,
} from '@/app/lib/atlas-notification-queue';
import type { AtlasDebtCollectionCase, DebtCollectionStage } from '@/app/types/atlas-debt-collection';
import type {
  AgingBucket,
  AtlasClientRiskProfile,
  AtlasDebtFollowUp,
  DebtAgingSummary,
  DebtCollectionDashboard,
  FollowUpChannel,
  RiskBand,
} from '@/app/types/atlas-debt-collection';
import { AGING_LABELS, STAGE_LABELS } from '@/app/types/atlas-debt-collection';

export { STAGE_LABELS };

const STAGE_ORDER: DebtCollectionStage[] = ['reminder_1', 'reminder_2', 'formal_notice', 'legal', 'closed', 'paid'];

export function computeAgingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

export function computeRiskScore(overdueCount: number, totalOutstanding: number, maxDaysOverdue: number): number {
  let score = 0;
  score += Math.min(overdueCount * 12, 36);
  score += Math.min(maxDaysOverdue * 0.5, 30);
  if (totalOutstanding > 50000) score += 20;
  else if (totalOutstanding > 20000) score += 12;
  else if (totalOutstanding > 5000) score += 6;
  return Math.min(100, Math.round(score));
}

export function riskBandFromScore(score: number): RiskBand {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export function suggestStageFromDaysOverdue(daysOverdue: number, current: DebtCollectionStage): DebtCollectionStage {
  if (current === 'paid' || current === 'closed') return current;
  if (daysOverdue >= 90) return 'legal';
  if (daysOverdue >= 60) return 'formal_notice';
  if (daysOverdue >= 30) return 'reminder_2';
  if (daysOverdue > 0) return 'reminder_1';
  return current;
}

function daysOverdueFromDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T12:00:00`);
  return Math.ceil((today.getTime() - due.getTime()) / 86400000);
}

export function rowToCase(row: Record<string, unknown>): AtlasDebtCollectionCase {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    invoiceId: (row.invoice_id as string | null) ?? null,
    clientId: (row.client_id as string | null) ?? null,
    clientName: String(row.client_name ?? ''),
    amountDue: Number(row.amount_due ?? 0),
    outstandingAmount: Number(row.outstanding_amount ?? row.amount_due ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    invoiceNumber: (row.invoice_number as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    daysOverdue: Number(row.days_overdue ?? 0),
    agingBucket: (row.aging_bucket as AgingBucket) ?? 'current',
    stage: row.stage as DebtCollectionStage,
    stageLabel: STAGE_LABELS[row.stage as DebtCollectionStage] ?? String(row.stage),
    lastContactAt: (row.last_contact_at as string | null) ?? null,
    nextActionAt: (row.next_action_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    clientEmail: (row.client_email as string | undefined) ?? undefined,
    clientPhone: (row.client_phone as string | undefined) ?? undefined,
  };
}

export function rowToFollowUp(row: Record<string, unknown>): AtlasDebtFollowUp {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    channel: row.channel as FollowUpChannel,
    recipient: (row.recipient as string | null) ?? null,
    stage: row.stage as DebtCollectionStage,
    message: String(row.message ?? ''),
    status: row.status as AtlasDebtFollowUp['status'],
    sentAt: String(row.sent_at ?? row.created_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToRiskProfile(row: Record<string, unknown>): AtlasClientRiskProfile {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    clientId: (row.client_id as string | null) ?? null,
    clientName: String(row.client_name ?? ''),
    riskScore: Number(row.risk_score ?? 0),
    riskBand: row.risk_band as RiskBand,
    totalOutstanding: Number(row.total_outstanding ?? 0),
    overdueCount: Number(row.overdue_count ?? 0),
    maxDaysOverdue: Number(row.max_days_overdue ?? 0),
    lastPaymentAt: (row.last_payment_at as string | null) ?? null,
    updatedAt: String(row.updated_at ?? ''),
    clientEmail: (row.client_email as string | undefined) ?? undefined,
    clientPhone: (row.client_phone as string | undefined) ?? undefined,
  };
}

async function getInvoicePaidAmount(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<number> {
  const { data } = await admin
    .from('atlas_payments')
    .select('paid_amount, amount, status')
    .eq('invoice_id', invoiceId)
    .in('status', ['paid', 'completed', 'confirmed']);
  return (data ?? []).reduce((s, p) => s + Number(p.paid_amount ?? p.amount ?? 0), 0);
}

export async function resolveClientContacts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  clientName: string,
  clientId?: string | null,
): Promise<{ email: string | null; phone: string | null; clientId: string | null }> {
  if (clientId) {
    const { data } = await admin
      .from('atlas_clients')
      .select('id, email, phone')
      .eq('id', clientId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      return {
        email: (data.email as string | null)?.trim() || null,
        phone: (data.phone as string | null)?.trim() || null,
        clientId: String(data.id),
      };
    }
  }

  const { data } = await admin
    .from('atlas_clients')
    .select('id, email, phone')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .ilike('name', clientName)
    .limit(1)
    .maybeSingle();

  return {
    email: (data?.email as string | null)?.trim() || null,
    phone: (data?.phone as string | null)?.trim() || null,
    clientId: data?.id ? String(data.id) : null,
  };
}

export async function recordFollowUp(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    caseId: string;
    channel: FollowUpChannel;
    recipient?: string;
    stage: DebtCollectionStage;
    message: string;
    status?: 'sent' | 'failed' | 'pending';
  },
): Promise<void> {
  await admin.from('zafirix_debt_follow_ups').insert({
    user_id: input.userId,
    company_id: input.companyId,
    case_id: input.caseId,
    channel: input.channel,
    recipient: input.recipient ?? null,
    stage: input.stage,
    message: input.message,
    status: input.status ?? 'sent',
  });
}

function buildReminderMessage(
  clientName: string,
  amount: number,
  stage: DebtCollectionStage,
  invoiceNumber?: string | null,
  dueDate?: string | null,
): string {
  const stageLabel = STAGE_LABELS[stage];
  const inv = invoiceNumber ? `Facture ${invoiceNumber}` : 'Facture';
  const due = dueDate ? ` — échéance ${dueDate}` : '';
  return `Bonjour ${clientName},\n\n${stageLabel} : ${inv}${due}.\nMontant dû : ${amount.toLocaleString('fr-MA')} MAD.\n\nMerci de régulariser votre situation ou de nous contacter.\n\nCordialement`;
}

/** Sync overdue invoices → cases, update aging, rebuild risk profiles. */
export async function syncOverdueInvoices(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ created: number; updated: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: invoices } = await admin
    .from('atlas_invoices')
    .select('id, number, client_name, client_id, total_ttc, due_date, status')
    .eq('user_id', userId)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .neq('status', 'paid')
    .lte('due_date', today);

  let created = 0;
  let updated = 0;

  for (const inv of invoices ?? []) {
    const paid = await getInvoicePaidAmount(admin, String(inv.id));
    const total = Number(inv.total_ttc ?? 0);
    const outstanding = Math.max(0, total - paid);
    if (outstanding <= 0) continue;

    const daysOverdue = daysOverdueFromDue(String(inv.due_date));
    const agingBucket = computeAgingBucket(daysOverdue);
    const suggestedStage = suggestStageFromDaysOverdue(daysOverdue, 'reminder_1');

    const { data: existing } = await admin
      .from('zafirix_debt_collection_cases')
      .select('*')
      .eq('invoice_id', inv.id)
      .maybeSingle();

    const clientContacts = await resolveClientContacts(
      admin,
      userId,
      companyId,
      String(inv.client_name),
      inv.client_id as string | null,
    );

    if (existing) {
      const stage = suggestStageFromDaysOverdue(daysOverdue, existing.stage as DebtCollectionStage);
      await admin
        .from('zafirix_debt_collection_cases')
        .update({
          amount_due: total,
          outstanding_amount: outstanding,
          paid_amount: paid,
          days_overdue: daysOverdue,
          aging_bucket: agingBucket,
          due_date: inv.due_date,
          invoice_number: inv.number,
          client_id: clientContacts.clientId ?? existing.client_id,
          stage: existing.stage === 'paid' || existing.stage === 'closed' ? existing.stage : stage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      updated++;
    } else {
      const { error } = await admin.from('zafirix_debt_collection_cases').insert({
        user_id: userId,
        company_id: companyId,
        invoice_id: inv.id,
        client_id: clientContacts.clientId,
        client_name: inv.client_name,
        invoice_number: inv.number,
        due_date: inv.due_date,
        amount_due: total,
        outstanding_amount: outstanding,
        paid_amount: paid,
        days_overdue: daysOverdue,
        aging_bucket: agingBucket,
        stage: suggestedStage,
        next_action_at: new Date().toISOString(),
      });
      if (!error) created++;
    }
  }

  await rebuildClientRiskProfiles(admin, userId, companyId);
  return { created, updated };
}

export async function rebuildClientRiskProfiles(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const { data: cases } = await admin
    .from('zafirix_debt_collection_cases')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('stage', ['reminder_1', 'reminder_2', 'formal_notice', 'legal']);

  type CaseRow = NonNullable<typeof cases>[number];
  const byClient = new Map<string, CaseRow[]>();
  for (const c of cases ?? []) {
    const name = String(c.client_name);
    const arr = byClient.get(name) ?? [];
    arr.push(c);
    byClient.set(name, arr);
  }

  for (const [clientName, clientCases] of byClient) {
    const totalOutstanding = clientCases.reduce((s, c) => s + Number(c.outstanding_amount ?? c.amount_due ?? 0), 0);
    const overdueCount = clientCases.length;
    const maxDays = Math.max(...clientCases.map((c) => Number(c.days_overdue ?? 0)));
    const score = computeRiskScore(overdueCount, totalOutstanding, maxDays);
    const band = riskBandFromScore(score);
    const contacts = await resolveClientContacts(admin, userId, companyId, clientName, clientCases[0]?.client_id as string);

    await admin.from('zafirix_client_risk_profiles').upsert(
      {
        user_id: userId,
        company_id: companyId,
        client_id: contacts.clientId,
        client_name: clientName,
        risk_score: score,
        risk_band: band,
        total_outstanding: totalOutstanding,
        overdue_count: overdueCount,
        max_days_overdue: maxDays,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,client_name' },
    );
  }
}

export async function sendClientPaymentReminder(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    caseRow: AtlasDebtCollectionCase;
    channels?: ('email' | 'whatsapp')[];
  },
): Promise<{ sent: number }> {
  const contacts = await resolveClientContacts(
    admin,
    input.userId,
    input.companyId,
    input.caseRow.clientName,
    input.caseRow.clientId,
  );

  const message = buildReminderMessage(
    input.caseRow.clientName,
    input.caseRow.outstandingAmount ?? input.caseRow.amountDue,
    input.caseRow.stage,
    input.caseRow.invoiceNumber,
    input.caseRow.dueDate,
  );

  const channels = input.channels ?? ['email', 'whatsapp'];
  let sent = 0;

  if (channels.includes('email') && contacts.email) {
    const r = await enqueueNotification(admin, {
      userId: input.userId,
      companyId: input.companyId,
      channel: 'email',
      category: 'debt_collection',
      title: `Relance — ${input.caseRow.clientName}`,
      body: message,
      recipientEmail: contacts.email,
      entityType: 'debt_case',
      entityId: input.caseRow.id,
      dedupeKey: debtDedupeKey(input.caseRow.id, input.caseRow.stage, 'client_email'),
    });
    if (r.queued) {
      sent++;
      await recordFollowUp(admin, {
        userId: input.userId,
        companyId: input.companyId,
        caseId: input.caseRow.id,
        channel: 'email',
        recipient: contacts.email,
        stage: input.caseRow.stage,
        message,
      });
    }
  }

  if (channels.includes('whatsapp') && contacts.phone) {
    const r = await enqueueNotification(admin, {
      userId: input.userId,
      companyId: input.companyId,
      channel: 'whatsapp',
      category: 'debt_collection',
      title: `Relance — ${input.caseRow.clientName}`,
      body: message,
      recipientPhone: contacts.phone,
      entityType: 'debt_case',
      entityId: input.caseRow.id,
      dedupeKey: debtDedupeKey(input.caseRow.id, input.caseRow.stage, 'client_wa'),
    });
    if (r.queued) {
      sent++;
      await recordFollowUp(admin, {
        userId: input.userId,
        companyId: input.companyId,
        caseId: input.caseRow.id,
        channel: 'whatsapp',
        recipient: contacts.phone,
        stage: input.caseRow.stage,
        message,
      });
    }
  }

  await admin
    .from('zafirix_debt_collection_cases')
    .update({ last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', input.caseRow.id);

  return { sent };
}

/** Automated scan: upcoming/overdue invoices + debt cases → manager + client alerts. */
export async function scanSmartDebtCollection(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ invoiceAlerts: number; debtAlerts: number }> {
  await syncOverdueInvoices(admin, userId, companyId);

  const manager = await resolveManagerContacts(admin, userId, companyId);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const soonYmd = soon.toISOString().slice(0, 10);

  let invoiceAlerts = 0;

  const { data: upcomingInvoices } = await admin
    .from('atlas_invoices')
    .select('id, number, client_name, client_id, due_date, total_ttc, status')
    .eq('company_id', companyId)
    .neq('status', 'paid')
    .lte('due_date', soonYmd);

  for (const inv of upcomingInvoices ?? []) {
    const overdue = String(inv.due_date) < today;
    const days = daysOverdueFromDue(String(inv.due_date));
    if (!overdue && days > 7) continue;

    const paid = await getInvoicePaidAmount(admin, String(inv.id));
    const outstanding = Math.max(0, Number(inv.total_ttc) - paid);
    if (outstanding <= 0) continue;

    const title = overdue
      ? `Relance facture ${inv.number} — ${inv.client_name}`
      : `Échéance facture ${inv.number} — J-${days}`;
    const body = buildReminderMessage(String(inv.client_name), outstanding, overdue ? 'reminder_1' : 'reminder_1', inv.number, inv.due_date);

    invoiceAlerts += await enqueueManagerAlert(admin, manager, {
      userId,
      companyId,
      category: 'invoice_reminder',
      title,
      body,
      entityType: 'invoice',
      entityId: String(inv.id),
      dedupeKey: invoiceDedupeKey(String(inv.id), 'all'),
    });

    const client = await resolveClientContacts(admin, userId, companyId, String(inv.client_name), inv.client_id as string);

    if (client.email) {
      const r = await enqueueNotification(admin, {
        userId,
        companyId,
        channel: 'email',
        category: 'invoice_reminder',
        title,
        body,
        recipientEmail: client.email,
        entityType: 'invoice',
        entityId: String(inv.id),
        dedupeKey: invoiceDedupeKey(String(inv.id), 'client_email'),
      });
      if (r.queued) invoiceAlerts++;
    }
    if (client.phone) {
      const r = await enqueueNotification(admin, {
        userId,
        companyId,
        channel: 'whatsapp',
        category: 'invoice_reminder',
        title,
        body,
        recipientPhone: client.phone,
        entityType: 'invoice',
        entityId: String(inv.id),
        dedupeKey: invoiceDedupeKey(String(inv.id), 'client_wa'),
      });
      if (r.queued) invoiceAlerts++;
    }
  }

  let debtAlerts = 0;
  const now = new Date().toISOString();
  const { data: cases } = await admin
    .from('zafirix_debt_collection_cases')
    .select('*')
    .eq('company_id', companyId)
    .in('stage', ['reminder_1', 'reminder_2', 'formal_notice', 'legal'])
    .or(`next_action_at.is.null,next_action_at.lte.${now}`);

  for (const row of cases ?? []) {
    const c = rowToCase(row as Record<string, unknown>);
    const stageLabel = STAGE_LABELS[c.stage];
    const title = `Recouvrement — ${c.clientName}`;
    const body = `${stageLabel}. Montant dû : ${(c.outstandingAmount ?? c.amountDue).toLocaleString('fr-MA')} MAD.`;

    debtAlerts += await enqueueManagerAlert(admin, manager, {
      userId,
      companyId,
      category: 'debt_collection',
      title,
      body,
      entityType: 'debt_case',
      entityId: c.id,
      dedupeKey: debtDedupeKey(c.id, c.stage, 'all'),
    });

    const { sent } = await sendClientPaymentReminder(admin, { userId, companyId, caseRow: c });
    debtAlerts += sent;
  }

  return { invoiceAlerts, debtAlerts };
}

export async function advanceDebtCase(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  caseId: string,
  notes?: string,
): Promise<AtlasDebtCollectionCase | null> {
  const { data: current } = await admin
    .from('zafirix_debt_collection_cases')
    .select('*')
    .eq('id', caseId)
    .eq('user_id', userId)
    .single();

  if (!current) return null;

  const idx = STAGE_ORDER.indexOf(current.stage as DebtCollectionStage);
  const nextStage = idx >= 0 && idx < STAGE_ORDER.length - 2 ? STAGE_ORDER[idx + 1] : current.stage;

  const { data, error } = await admin
    .from('zafirix_debt_collection_cases')
    .update({
      stage: nextStage,
      last_contact_at: new Date().toISOString(),
      next_action_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      notes: notes ?? current.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId)
    .select('*')
    .single();

  if (error || !data) return null;

  const caseRow = rowToCase(data as Record<string, unknown>);
  await recordFollowUp(admin, {
    userId,
    companyId,
    caseId,
    channel: 'manual',
    stage: nextStage as DebtCollectionStage,
    message: `Passage à l'étape : ${STAGE_LABELS[nextStage as DebtCollectionStage]}`,
  });

  return caseRow;
}

export async function buildDebtDashboard(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<DebtCollectionDashboard> {
  const { data: caseRows } = await admin
    .from('zafirix_debt_collection_cases')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('days_overdue', { ascending: false })
    .limit(200);

  const cases: AtlasDebtCollectionCase[] = [];
  for (const row of caseRows ?? []) {
    const contacts = await resolveClientContacts(
      admin,
      userId,
      companyId,
      String(row.client_name),
      row.client_id as string | null,
    );
    cases.push(
      rowToCase({
        ...(row as Record<string, unknown>),
        client_email: contacts.email,
        client_phone: contacts.phone,
      }),
    );
  }

  const activeCases = cases.filter((c) => c.stage !== 'paid' && c.stage !== 'closed');
  const totalDue = activeCases.reduce((s, c) => s + (c.outstandingAmount ?? c.amountDue), 0);

  const buckets: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];
  const aging: DebtAgingSummary[] = buckets.map((bucket) => {
    const inBucket = activeCases.filter((c) => c.agingBucket === bucket);
    return {
      bucket,
      label: AGING_LABELS[bucket],
      count: inBucket.length,
      amount: inBucket.reduce((s, c) => s + (c.outstandingAmount ?? c.amountDue), 0),
    };
  });

  const { data: riskRows } = await admin
    .from('zafirix_client_risk_profiles')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('risk_score', { ascending: false })
    .limit(50);

  const riskProfiles: AtlasClientRiskProfile[] = [];
  for (const row of riskRows ?? []) {
    const contacts = await resolveClientContacts(
      admin,
      userId,
      companyId,
      String(row.client_name),
      row.client_id as string | null,
    );
    riskProfiles.push(
      rowToRiskProfile({
        ...(row as Record<string, unknown>),
        client_email: contacts.email,
        client_phone: contacts.phone,
      }),
    );
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: followRows } = await admin
    .from('zafirix_debt_follow_ups')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .gte('sent_at', weekAgo)
    .order('sent_at', { ascending: false })
    .limit(50);

  const followUps = (followRows ?? []).map((r) => rowToFollowUp(r as Record<string, unknown>));

  return {
    cases,
    totalDue,
    aging,
    riskProfiles,
    followUps,
    stats: {
      activeCases: activeCases.length,
      overdueInvoices: activeCases.filter((c) => (c.daysOverdue ?? 0) > 0).length,
      highRiskClients: riskProfiles.filter((r) => r.riskBand === 'high' || r.riskBand === 'critical').length,
      remindersSentWeek: followUps.length,
    },
  };
}
