/**
 * Tax calendar server — sync deadlines, compliance events, preferences, fiscal alerts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMoroccanFiscalDeadlines, categoryLabelFr } from '@/app/lib/atlas-fiscal-calendar';
import {
  enqueueManagerAlert,
  enqueueNotification,
  fiscalDedupeKey,
  FISCAL_ALERT_THRESHOLDS_DAYS,
  processNotificationQueue,
  resolveManagerContacts,
} from '@/app/lib/atlas-notification-queue';
import type { FiscalDeadline } from '@/app/types/atlas-fiscal-calendar';
import type {
  AtlasComplianceEvent,
  AtlasNotificationPreferences,
  AtlasTaxDeadline,
  ComplianceEventType,
  TaxDeadlineStatus,
} from '@/app/types/atlas-tax-calendar';
import { DEFAULT_ALERT_DAYS, DEFAULT_FISCAL_CATEGORIES } from '@/app/types/atlas-tax-calendar';

const FISCAL_ALERT_WINDOW_DAYS = 2;

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / 86400000);
}

function statusFromDeadline(d: FiscalDeadline): TaxDeadlineStatus {
  if (d.daysRemaining < 0) return 'overdue';
  if (d.daysRemaining <= 7) return 'due_soon';
  return 'upcoming';
}

export function rowToTaxDeadline(row: Record<string, unknown>, ref = new Date()): AtlasTaxDeadline {
  const dueDate = String(row.due_date ?? '');
  const due = new Date(`${dueDate}T12:00:00`);
  const daysRemaining = daysBetween(ref, due);
  let severity: AtlasTaxDeadline['severity'] = 'green';
  if (daysRemaining <= 7) severity = 'red';
  else if (daysRemaining <= 21) severity = 'orange';

  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    deadlineKey: String(row.deadline_key ?? ''),
    category: row.category as AtlasTaxDeadline['category'],
    labelFr: String(row.label_fr ?? ''),
    labelAr: String(row.label_ar ?? ''),
    dueDate,
    href: String(row.href ?? '/'),
    externalUrl: (row.external_url as string | null) ?? null,
    periodLabel: (row.period_label as string | null) ?? null,
    status: (row.status as TaxDeadlineStatus) ?? statusFromDeadline({ daysRemaining } as FiscalDeadline),
    filedAt: (row.filed_at as string | null) ?? null,
    daysRemaining,
    severity,
    syncedAt: String(row.synced_at ?? row.updated_at ?? ''),
  };
}

export function rowToComplianceEvent(row: Record<string, unknown>): AtlasComplianceEvent {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    deadlineId: (row.deadline_id as string | null) ?? null,
    deadlineKey: (row.deadline_key as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    eventType: row.event_type as ComplianceEventType,
    channel: (row.channel as string | null) ?? null,
    title: String(row.title ?? ''),
    body: (row.body as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToPreferences(row: Record<string, unknown>): AtlasNotificationPreferences {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    emailEnabled: row.email_enabled !== false,
    whatsappEnabled: row.whatsapp_enabled !== false,
    inAppEnabled: row.in_app_enabled !== false,
    alertDays: Array.isArray(row.alert_days) ? (row.alert_days as number[]) : [...DEFAULT_ALERT_DAYS],
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [...DEFAULT_FISCAL_CATEGORIES],
    accountantEmail: (row.accountant_email as string | null) ?? null,
    accountantPhone: (row.accountant_phone as string | null) ?? null,
    accountantName: (row.accountant_name as string | null) ?? null,
    managerEmail: (row.manager_email as string | null) ?? null,
    managerPhone: (row.manager_phone as string | null) ?? null,
    timezone: String(row.timezone ?? 'Africa/Casablanca'),
  };
}

export async function getOrCreateNotificationPreferences(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<AtlasNotificationPreferences> {
  const { data: existing } = await admin
    .from('zafirix_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (existing) return rowToPreferences(existing as Record<string, unknown>);

  const { data, error } = await admin
    .from('zafirix_notification_preferences')
    .insert({ user_id: userId, company_id: companyId })
    .select('*')
    .single();

  if (error || !data) {
    return {
      id: '',
      companyId,
      emailEnabled: true,
      whatsappEnabled: true,
      inAppEnabled: true,
      alertDays: [...DEFAULT_ALERT_DAYS],
      categories: [...DEFAULT_FISCAL_CATEGORIES],
      accountantEmail: null,
      accountantPhone: null,
      accountantName: null,
      managerEmail: null,
      managerPhone: null,
      timezone: 'Africa/Casablanca',
    };
  }

  return rowToPreferences(data as Record<string, unknown>);
}

export async function updateNotificationPreferences(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  patch: Partial<Omit<AtlasNotificationPreferences, 'id' | 'companyId'>>,
): Promise<AtlasNotificationPreferences> {
  await getOrCreateNotificationPreferences(admin, userId, companyId);

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.emailEnabled !== undefined) updatePayload.email_enabled = patch.emailEnabled;
  if (patch.whatsappEnabled !== undefined) updatePayload.whatsapp_enabled = patch.whatsappEnabled;
  if (patch.inAppEnabled !== undefined) updatePayload.in_app_enabled = patch.inAppEnabled;
  if (patch.alertDays !== undefined) updatePayload.alert_days = patch.alertDays;
  if (patch.categories !== undefined) updatePayload.categories = patch.categories;
  if (patch.accountantEmail !== undefined) updatePayload.accountant_email = patch.accountantEmail;
  if (patch.accountantPhone !== undefined) updatePayload.accountant_phone = patch.accountantPhone;
  if (patch.accountantName !== undefined) updatePayload.accountant_name = patch.accountantName;
  if (patch.managerEmail !== undefined) updatePayload.manager_email = patch.managerEmail;
  if (patch.managerPhone !== undefined) updatePayload.manager_phone = patch.managerPhone;
  if (patch.timezone !== undefined) updatePayload.timezone = patch.timezone;

  const { data, error } = await admin
    .from('zafirix_notification_preferences')
    .update(updatePayload)
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'preferences_update_failed');

  await recordComplianceEvent(admin, {
    userId,
    companyId,
    eventType: 'preference_updated',
    title: 'Préférences de notification mises à jour',
    body: 'Calendrier fiscal — alertes email/WhatsApp',
  });

  return rowToPreferences(data as Record<string, unknown>);
}

export async function recordComplianceEvent(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    eventType: ComplianceEventType;
    title: string;
    body?: string;
    deadlineId?: string;
    deadlineKey?: string;
    category?: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from('zafirix_compliance_events').insert({
    user_id: input.userId,
    company_id: input.companyId,
    deadline_id: input.deadlineId ?? null,
    deadline_key: input.deadlineKey ?? null,
    category: input.category ?? null,
    event_type: input.eventType,
    channel: input.channel ?? null,
    title: input.title,
    body: input.body ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function syncTaxDeadlines(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<AtlasTaxDeadline[]> {
  const radar = buildMoroccanFiscalDeadlines(new Date(), companyId);
  const now = new Date().toISOString();

  for (const d of radar.deadlines) {
    const { data: existing } = await admin
      .from('zafirix_tax_deadlines')
      .select('id, status, filed_at')
      .eq('company_id', companyId)
      .eq('deadline_key', d.id)
      .maybeSingle();

    if (existing?.status === 'filed' || existing?.status === 'waived') continue;

    await admin.from('zafirix_tax_deadlines').upsert(
      {
        user_id: userId,
        company_id: companyId,
        deadline_key: d.id,
        category: d.category,
        label_fr: d.labelFr,
        label_ar: d.labelAr,
        due_date: d.dueDate,
        href: d.href,
        external_url: d.externalUrl ?? null,
        period_label: d.periodLabel ?? null,
        status: statusFromDeadline(d),
        synced_at: now,
        updated_at: now,
      },
      { onConflict: 'company_id,deadline_key' },
    );
  }

  const { data: rows } = await admin
    .from('zafirix_tax_deadlines')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('due_date', { ascending: true });

  return (rows ?? []).map((r) => rowToTaxDeadline(r as Record<string, unknown>));
}

export async function markDeadlineFiled(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  deadlineId: string,
): Promise<AtlasTaxDeadline | null> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('zafirix_tax_deadlines')
    .update({ status: 'filed', filed_at: now, updated_at: now })
    .eq('id', deadlineId)
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error || !data) return null;

  await recordComplianceEvent(admin, {
    userId,
    companyId,
    deadlineId,
    deadlineKey: String(data.deadline_key),
    category: String(data.category),
    eventType: 'deadline_filed',
    title: `Déclaration effectuée — ${data.label_fr}`,
    body: `Échéance ${data.due_date} marquée comme déposée`,
  });

  return rowToTaxDeadline(data as Record<string, unknown>);
}

function matchingThreshold(daysRemaining: number, alertDays: number[]): number | null {
  if (daysRemaining < 0) return daysRemaining >= -7 ? 0 : null;
  const sorted = [...alertDays].sort((a, b) => b - a);
  for (const t of sorted) {
    if (daysRemaining <= t && daysRemaining > t - FISCAL_ALERT_WINDOW_DAYS) return t;
  }
  return null;
}

export type FiscalAlertRecipients = {
  managerEmail: string | null;
  managerPhone: string | null;
  accountantEmail: string | null;
  accountantPhone: string | null;
};

export async function resolveFiscalAlertRecipients(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  prefs: AtlasNotificationPreferences,
): Promise<FiscalAlertRecipients> {
  const manager = await resolveManagerContacts(admin, userId, companyId);
  return {
    managerEmail: prefs.managerEmail?.trim() || manager.email,
    managerPhone: prefs.managerPhone?.trim() || manager.phone,
    accountantEmail: prefs.accountantEmail?.trim() || null,
    accountantPhone: prefs.accountantPhone?.trim() || null,
  };
}

async function enqueueFiscalAlert(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    prefs: AtlasNotificationPreferences;
    recipients: FiscalAlertRecipients;
    deadline: AtlasTaxDeadline;
    threshold: number;
    title: string;
    body: string;
  },
): Promise<number> {
  let count = 0;
  const base = {
    userId: input.userId,
    companyId: input.companyId,
    category: 'fiscal_deadline' as const,
    title: input.title,
    body: input.body,
    entityType: 'fiscal_deadline',
    entityId: input.deadline.deadlineKey,
    metadata: {
      daysRemaining: input.deadline.daysRemaining,
      category: input.deadline.category,
      dueDate: input.deadline.dueDate,
      threshold: input.threshold,
    },
  };

  if (input.prefs.inAppEnabled) {
    count += await enqueueManagerAlert(
      admin,
      { email: input.recipients.managerEmail, phone: input.recipients.managerPhone, userEmail: input.recipients.managerEmail },
      { ...base, dedupeKey: fiscalDedupeKey(input.deadline.deadlineKey, input.threshold, 'manager') },
    );
  }

  if (input.prefs.emailEnabled && input.recipients.managerEmail) {
    const r = await enqueueNotification(admin, {
      ...base,
      channel: 'email',
      recipientEmail: input.recipients.managerEmail,
      dedupeKey: fiscalDedupeKey(input.deadline.deadlineKey, input.threshold, 'mgr_email'),
    });
    if (r.queued) {
      count++;
      await recordComplianceEvent(admin, {
        userId: input.userId,
        companyId: input.companyId,
        deadlineKey: input.deadline.deadlineKey,
        category: input.deadline.category,
        eventType: 'alert_email',
        channel: 'email',
        title: input.title,
        body: `Manager: ${input.recipients.managerEmail}`,
      });
    }
  }

  if (input.prefs.whatsappEnabled && input.recipients.managerPhone) {
    const r = await enqueueNotification(admin, {
      ...base,
      channel: 'whatsapp',
      recipientPhone: input.recipients.managerPhone,
      dedupeKey: fiscalDedupeKey(input.deadline.deadlineKey, input.threshold, 'mgr_wa'),
    });
    if (r.queued) {
      count++;
      await recordComplianceEvent(admin, {
        userId: input.userId,
        companyId: input.companyId,
        deadlineKey: input.deadline.deadlineKey,
        category: input.deadline.category,
        eventType: 'alert_whatsapp',
        channel: 'whatsapp',
        title: input.title,
        body: `Manager: ${input.recipients.managerPhone}`,
      });
    }
  }

  if (input.recipients.accountantEmail && input.prefs.emailEnabled) {
    const r = await enqueueNotification(admin, {
      ...base,
      channel: 'email',
      recipientEmail: input.recipients.accountantEmail,
      dedupeKey: fiscalDedupeKey(input.deadline.deadlineKey, input.threshold, 'acct_email'),
    });
    if (r.queued) {
      count++;
      await recordComplianceEvent(admin, {
        userId: input.userId,
        companyId: input.companyId,
        deadlineKey: input.deadline.deadlineKey,
        category: input.deadline.category,
        eventType: 'alert_email',
        channel: 'email',
        title: `[Comptable] ${input.title}`,
        body: input.recipients.accountantEmail,
      });
    }
  }

  if (input.recipients.accountantPhone && input.prefs.whatsappEnabled) {
    const r = await enqueueNotification(admin, {
      ...base,
      channel: 'whatsapp',
      recipientPhone: input.recipients.accountantPhone,
      dedupeKey: fiscalDedupeKey(input.deadline.deadlineKey, input.threshold, 'acct_wa'),
    });
    if (r.queued) count++;
  }

  return count;
}

export async function scanAndAlertTaxDeadlines(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ synced: number; alerted: number }> {
  const deadlines = await syncTaxDeadlines(admin, userId, companyId);
  const prefs = await getOrCreateNotificationPreferences(admin, userId, companyId);
  const recipients = await resolveFiscalAlertRecipients(admin, userId, companyId, prefs);
  const categorySet = new Set(prefs.categories);
  const maxDays = Math.max(...prefs.alertDays, ...FISCAL_ALERT_THRESHOLDS_DAYS);

  let alerted = 0;

  for (const d of deadlines) {
    if (d.status === 'filed' || d.status === 'waived') continue;
    if (!categorySet.has(d.category)) continue;
    if (d.daysRemaining > maxDays) continue;

    const threshold = matchingThreshold(d.daysRemaining, prefs.alertDays);
    if (threshold === null) continue;

    const cat = categoryLabelFr(d.category);
    const title =
      d.daysRemaining <= 1
        ? `URGENT — ${cat} : ${d.labelFr}`
        : `Échéance ${cat} — J-${Math.max(d.daysRemaining, 0)}`;
    const body = `${d.labelFr} — date limite ${d.dueDate}. Préparez votre déclaration ${cat} dans Zafirix Pro.`;

    alerted += await enqueueFiscalAlert(admin, {
      userId,
      companyId,
      prefs,
      recipients,
      deadline: d,
      threshold,
      title,
      body,
    });

    if (d.daysRemaining < 0) {
      await recordComplianceEvent(admin, {
        userId,
        companyId,
        deadlineId: d.id,
        deadlineKey: d.deadlineKey,
        category: d.category,
        eventType: 'deadline_missed',
        title: `Échéance dépassée — ${d.labelFr}`,
        body: `Retard de ${Math.abs(d.daysRemaining)} jour(s)`,
      });
    }
  }

  await processNotificationQueue(admin, { limit: 50, companyId });
  return { synced: deadlines.length, alerted };
}

export async function getTaxCalendarPayload(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  opts?: { sync?: boolean },
): Promise<{
  deadlines: AtlasTaxDeadline[];
  preferences: AtlasNotificationPreferences;
  events: AtlasComplianceEvent[];
  counts: { red: number; orange: number; green: number; total: number; filed: number };
}> {
  const deadlines =
    opts?.sync !== false
      ? await syncTaxDeadlines(admin, userId, companyId)
      : ((await admin
          .from('zafirix_tax_deadlines')
          .select('*')
          .eq('company_id', companyId)
          .eq('user_id', userId)
          .order('due_date', { ascending: true })).data ?? []).map((r) =>
          rowToTaxDeadline(r as Record<string, unknown>),
        );

  const prefs = await getOrCreateNotificationPreferences(admin, userId, companyId);

  const { data: events } = await admin
    .from('zafirix_compliance_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  const active = deadlines.filter((d) => d.status !== 'filed' && d.status !== 'waived');
  const counts = {
    red: active.filter((d) => d.severity === 'red').length,
    orange: active.filter((d) => d.severity === 'orange').length,
    green: active.filter((d) => d.severity === 'green').length,
    total: active.length,
    filed: deadlines.filter((d) => d.status === 'filed').length,
  };

  return {
    deadlines,
    preferences: prefs,
    events: (events ?? []).map((e) => rowToComplianceEvent(e as Record<string, unknown>)),
    counts,
  };
}
