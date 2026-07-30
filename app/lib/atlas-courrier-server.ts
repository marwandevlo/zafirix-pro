/**
 * Courrier Arrivé/Départ — correspondence archive, search, and flow tracking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasCorrespondence,
  AtlasCorrespondenceAttachment,
  AtlasCorrespondenceEvent,
  CorrespondenceConfidentiality,
  CorrespondenceDirection,
  CorrespondenceLetterType,
  CorrespondencePriority,
  CorrespondenceStatus,
  CourrierDashboardSummary,
  CourrierPayload,
} from '@/app/types/atlas-courrier';
import {
  CONFIDENTIALITY_LABELS,
  DIRECTION_LABELS,
  LETTER_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '@/app/types/atlas-courrier';

export { CONFIDENTIALITY_LABELS, DIRECTION_LABELS, LETTER_TYPE_LABELS, PRIORITY_LABELS, STATUS_LABELS };

function daysUntil(ymd: string | null): number | null {
  if (!ymd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T12:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function rowToAttachment(row: Record<string, unknown>): AtlasCorrespondenceAttachment {
  return {
    id: String(row.id),
    correspondenceId: String(row.correspondence_id),
    fileName: String(row.file_name ?? ''),
    fileUrl: (row.file_url as string | null) ?? null,
    documentType: row.document_type as AtlasCorrespondenceAttachment['documentType'],
    sourceDocumentId: (row.source_document_id as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    uploadedAt: String(row.uploaded_at ?? ''),
  };
}

export function rowToCorrespondence(
  row: Record<string, unknown>,
  attachments: AtlasCorrespondenceAttachment[] = [],
): AtlasCorrespondence {
  const responseDueDate = (row.response_due_date as string | null) ?? null;
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    direction: row.direction as CorrespondenceDirection,
    referenceNumber: String(row.reference_number ?? ''),
    externalReference: (row.external_reference as string | null) ?? null,
    subject: String(row.subject ?? ''),
    letterType: row.letter_type as CorrespondenceLetterType,
    status: row.status as CorrespondenceStatus,
    priority: row.priority as CorrespondencePriority,
    confidentiality: row.confidentiality as CorrespondenceConfidentiality,
    correspondenceDate: String(row.correspondence_date ?? ''),
    receivedAt: (row.received_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    responseDueDate,
    daysUntilResponseDue: daysUntil(responseDueDate),
    senderName: (row.sender_name as string | null) ?? null,
    senderOrganization: (row.sender_organization as string | null) ?? null,
    senderAddress: (row.sender_address as string | null) ?? null,
    senderEmail: (row.sender_email as string | null) ?? null,
    senderPhone: (row.sender_phone as string | null) ?? null,
    senderCity: (row.sender_city as string | null) ?? null,
    senderCountry: (row.sender_country as string | null) ?? null,
    recipientName: (row.recipient_name as string | null) ?? null,
    recipientOrganization: (row.recipient_organization as string | null) ?? null,
    recipientAddress: (row.recipient_address as string | null) ?? null,
    recipientEmail: (row.recipient_email as string | null) ?? null,
    recipientPhone: (row.recipient_phone as string | null) ?? null,
    recipientCity: (row.recipient_city as string | null) ?? null,
    recipientCountry: (row.recipient_country as string | null) ?? null,
    assignedTo: (row.assigned_to as string | null) ?? null,
    clientId: (row.client_id as string | null) ?? null,
    linkedCorrespondenceId: (row.linked_correspondence_id as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    attachments,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function rowToEvent(row: Record<string, unknown>): AtlasCorrespondenceEvent {
  return {
    id: String(row.id),
    correspondenceId: String(row.correspondence_id),
    eventType: String(row.event_type ?? ''),
    channel: (row.channel as string | null) ?? null,
    title: String(row.title ?? ''),
    body: (row.body as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

async function loadAttachments(
  admin: SupabaseClient,
  correspondenceIds: string[],
): Promise<Map<string, AtlasCorrespondenceAttachment[]>> {
  const map = new Map<string, AtlasCorrespondenceAttachment[]>();
  if (correspondenceIds.length === 0) return map;

  const { data } = await admin
    .from('zafirix_correspondence_attachments')
    .select('*')
    .in('correspondence_id', correspondenceIds)
    .order('uploaded_at', { ascending: false });

  for (const row of data ?? []) {
    const cid = String(row.correspondence_id);
    const list = map.get(cid) ?? [];
    list.push(rowToAttachment(row as Record<string, unknown>));
    map.set(cid, list);
  }
  return map;
}

async function nextReferenceNumber(
  admin: SupabaseClient,
  companyId: string,
  direction: CorrespondenceDirection,
): Promise<string> {
  const prefix = direction === 'incoming' ? 'CA' : 'CD';
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-`;

  const { data } = await admin
    .from('zafirix_correspondence')
    .select('reference_number')
    .eq('company_id', companyId)
    .like('reference_number', `${pattern}%`)
    .order('reference_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data?.[0]?.reference_number) {
    const parts = String(data[0].reference_number).split('-');
    const last = parseInt(parts[parts.length - 1] ?? '0', 10);
    if (!Number.isNaN(last)) seq = last + 1;
  }
  return `${pattern}${String(seq).padStart(4, '0')}`;
}

function buildSummary(items: AtlasCorrespondence[]): CourrierDashboardSummary {
  const summary: CourrierDashboardSummary = {
    total: items.length,
    incoming: 0,
    outgoing: 0,
    registered: 0,
    inProgress: 0,
    replied: 0,
    archived: 0,
    overdueResponses: 0,
    urgent: 0,
  };

  for (const item of items) {
    if (item.direction === 'incoming') summary.incoming++;
    else summary.outgoing++;
    if (item.status === 'registered') summary.registered++;
    if (item.status === 'in_progress') summary.inProgress++;
    if (item.status === 'replied') summary.replied++;
    if (item.status === 'archived') summary.archived++;
    if (item.priority === 'urgent') summary.urgent++;
    if (
      item.responseDueDate &&
      item.daysUntilResponseDue != null &&
      item.daysUntilResponseDue < 0 &&
      item.status !== 'replied' &&
      item.status !== 'archived' &&
      item.status !== 'cancelled'
    ) {
      summary.overdueResponses++;
    }
  }
  return summary;
}

export type CourrierSearchFilters = {
  direction?: CorrespondenceDirection | 'all';
  status?: CorrespondenceStatus | 'all';
  letterType?: CorrespondenceLetterType | 'all';
  q?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function getCourrierPayload(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  filters: CourrierSearchFilters = {},
): Promise<CourrierPayload> {
  let query = admin
    .from('zafirix_correspondence')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('correspondence_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.direction && filters.direction !== 'all') {
    query = query.eq('direction', filters.direction);
  }
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters.letterType && filters.letterType !== 'all') {
    query = query.eq('letter_type', filters.letterType);
  }
  if (filters.dateFrom) {
    query = query.gte('correspondence_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('correspondence_date', filters.dateTo);
  }

  const { data: rows, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  let filtered = rows ?? [];
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((r) => {
      const hay = [
        r.reference_number,
        r.external_reference,
        r.subject,
        r.sender_name,
        r.sender_organization,
        r.recipient_name,
        r.recipient_organization,
        r.notes,
        r.summary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const ids = filtered.map((r) => String(r.id));
  const attachments = await loadAttachments(admin, ids);

  const items = filtered.map((r) =>
    rowToCorrespondence(r as Record<string, unknown>, attachments.get(String(r.id)) ?? []),
  );

  const { data: eventRows } = await admin
    .from('zafirix_correspondence_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    items,
    summary: buildSummary(items),
    events: (eventRows ?? []).map((r) => rowToEvent(r as Record<string, unknown>)),
  };
}

async function logEvent(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  correspondenceId: string,
  eventType: string,
  title: string,
  body?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await admin.from('zafirix_correspondence_events').insert({
    user_id: userId,
    company_id: companyId,
    correspondence_id: correspondenceId,
    event_type: eventType,
    title,
    body: body ?? null,
    metadata: metadata ?? {},
  });
}

export async function createCorrespondence(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    direction: CorrespondenceDirection;
    subject: string;
    letterType?: CorrespondenceLetterType;
    priority?: CorrespondencePriority;
    confidentiality?: CorrespondenceConfidentiality;
    correspondenceDate?: string;
    externalReference?: string;
    referenceNumber?: string;
    responseDueDate?: string;
    senderName?: string;
    senderOrganization?: string;
    senderAddress?: string;
    senderEmail?: string;
    senderPhone?: string;
    senderCity?: string;
    recipientName?: string;
    recipientOrganization?: string;
    recipientAddress?: string;
    recipientEmail?: string;
    recipientPhone?: string;
    recipientCity?: string;
    assignedTo?: string;
    summary?: string;
    notes?: string;
    receivedAt?: string;
    sentAt?: string;
    attachments?: Array<{ fileName: string; fileUrl?: string; documentType?: string }>;
  },
): Promise<AtlasCorrespondence> {
  const referenceNumber =
    input.referenceNumber?.trim() ||
    (await nextReferenceNumber(admin, companyId, input.direction));

  const now = new Date().toISOString();
  const isIncoming = input.direction === 'incoming';

  const { data: row, error } = await admin
    .from('zafirix_correspondence')
    .insert({
      user_id: userId,
      company_id: companyId,
      direction: input.direction,
      reference_number: referenceNumber,
      external_reference: input.externalReference ?? null,
      subject: input.subject,
      letter_type: input.letterType ?? 'administrative',
      priority: input.priority ?? 'normal',
      confidentiality: input.confidentiality ?? 'internal',
      correspondence_date: input.correspondenceDate ?? new Date().toISOString().slice(0, 10),
      received_at: isIncoming ? (input.receivedAt ?? now) : null,
      sent_at: !isIncoming ? (input.sentAt ?? now) : null,
      response_due_date: input.responseDueDate ?? null,
      sender_name: input.senderName ?? null,
      sender_organization: input.senderOrganization ?? null,
      sender_address: input.senderAddress ?? null,
      sender_email: input.senderEmail ?? null,
      sender_phone: input.senderPhone ?? null,
      sender_city: input.senderCity ?? null,
      recipient_name: input.recipientName ?? null,
      recipient_organization: input.recipientOrganization ?? null,
      recipient_address: input.recipientAddress ?? null,
      recipient_email: input.recipientEmail ?? null,
      recipient_phone: input.recipientPhone ?? null,
      recipient_city: input.recipientCity ?? null,
      assigned_to: input.assignedTo ?? null,
      summary: input.summary ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();

  if (error || !row) throw new Error(error?.message ?? 'courrier_create_failed');

  const correspondenceId = String(row.id);

  for (const a of input.attachments ?? []) {
    await admin.from('zafirix_correspondence_attachments').insert({
      user_id: userId,
      company_id: companyId,
      correspondence_id: correspondenceId,
      file_name: a.fileName,
      file_url: a.fileUrl ?? null,
      document_type: a.documentType ?? 'scan',
    });
  }

  await logEvent(
    admin,
    userId,
    companyId,
    correspondenceId,
    'created',
    `${DIRECTION_LABELS[input.direction]} — ${referenceNumber}`,
    input.subject,
  );

  const attachments = await loadAttachments(admin, [correspondenceId]);
  return rowToCorrespondence(row as Record<string, unknown>, attachments.get(correspondenceId) ?? []);
}

export async function updateCorrespondenceStatus(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  correspondenceId: string,
  status: CorrespondenceStatus,
  extra?: { assignedTo?: string; notes?: string },
): Promise<AtlasCorrespondence | null> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'archived') patch.archived_at = new Date().toISOString();
  if (extra?.assignedTo !== undefined) patch.assigned_to = extra.assignedTo;
  if (extra?.notes !== undefined) patch.notes = extra.notes;

  const { data, error } = await admin
    .from('zafirix_correspondence')
    .update(patch)
    .eq('id', correspondenceId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  await logEvent(
    admin,
    userId,
    companyId,
    correspondenceId,
    status === 'archived' ? 'archived' : 'status_changed',
    `Statut → ${STATUS_LABELS[status]}`,
    extra?.notes,
    { status },
  );

  const attachments = await loadAttachments(admin, [correspondenceId]);
  return rowToCorrespondence(data as Record<string, unknown>, attachments.get(correspondenceId) ?? []);
}

export async function addCorrespondenceAttachment(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  correspondenceId: string,
  attachment: { fileName: string; fileUrl?: string; documentType?: string },
): Promise<AtlasCorrespondenceAttachment | null> {
  const { data: parent } = await admin
    .from('zafirix_correspondence')
    .select('id')
    .eq('id', correspondenceId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!parent) return null;

  const { data, error } = await admin
    .from('zafirix_correspondence_attachments')
    .insert({
      user_id: userId,
      company_id: companyId,
      correspondence_id: correspondenceId,
      file_name: attachment.fileName,
      file_url: attachment.fileUrl ?? null,
      document_type: attachment.documentType ?? 'scan',
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'attachment_failed');

  await logEvent(
    admin,
    userId,
    companyId,
    correspondenceId,
    'attachment_added',
    `Pièce jointe : ${attachment.fileName}`,
  );

  return rowToAttachment(data as Record<string, unknown>);
}
