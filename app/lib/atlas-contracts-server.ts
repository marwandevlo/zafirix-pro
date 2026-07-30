/**
 * Smart contract management — lifecycle, parties, attachments, renewal alerts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  contractDedupeKey,
  enqueueManagerAlert,
  processNotificationQueue,
  resolveManagerContacts,
} from '@/app/lib/atlas-notification-queue';
import type {
  AtlasContract,
  AtlasContractAttachment,
  AtlasContractEvent,
  AtlasContractParty,
  ContractDashboardSummary,
  ContractPartyRole,
  ContractsPayload,
  ContractStatus,
  ContractType,
} from '@/app/types/atlas-contracts';
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  DEFAULT_CONTRACT_ALERT_DAYS,
} from '@/app/types/atlas-contracts';

export { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS, DEFAULT_CONTRACT_ALERT_DAYS };

function daysUntil(ymd: string | null): number | null {
  if (!ymd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T12:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function matchingThreshold(daysRemaining: number, thresholds: number[]): number | null {
  const window = 2;
  if (daysRemaining < 0) return daysRemaining >= -7 ? 0 : null;
  const sorted = [...thresholds].sort((a, b) => b - a);
  for (const t of sorted) {
    if (daysRemaining <= t && daysRemaining > t - window) return t;
  }
  return null;
}

export function computeContractStatus(
  row: {
    status: string;
    terminated_at?: string | null;
    expiry_date?: string | null;
    renewal_date?: string | null;
    renewal_notice_days?: number;
  },
): ContractStatus {
  if (row.status === 'terminated' || row.terminated_at) return 'terminated';
  if (row.status === 'renewed') return 'renewed';
  if (row.status === 'draft') return 'draft';

  const notice = Number(row.renewal_notice_days ?? 30);
  const expiryDays = daysUntil(row.expiry_date ?? null);
  const renewalDays = daysUntil(row.renewal_date ?? null);

  if (expiryDays !== null && expiryDays < 0) return 'terminated';
  if (renewalDays !== null && renewalDays < 0) return 'expiring';

  const nearExpiry = expiryDays !== null && expiryDays <= notice;
  const nearRenewal = renewalDays !== null && renewalDays <= notice;
  if (nearExpiry || nearRenewal) return 'expiring';

  return 'active';
}

export function rowToParty(row: Record<string, unknown>): AtlasContractParty {
  return {
    id: String(row.id),
    contractId: String(row.contract_id),
    partyName: String(row.party_name ?? ''),
    partyRole: row.party_role as ContractPartyRole,
    contactEmail: (row.contact_email as string | null) ?? null,
    contactPhone: (row.contact_phone as string | null) ?? null,
    clientId: (row.client_id as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function rowToAttachment(row: Record<string, unknown>): AtlasContractAttachment {
  return {
    id: String(row.id),
    contractId: String(row.contract_id),
    fileName: String(row.file_name ?? ''),
    fileUrl: (row.file_url as string | null) ?? null,
    documentType: row.document_type as AtlasContractAttachment['documentType'],
    sourceDocumentId: (row.source_document_id as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    uploadedAt: String(row.uploaded_at ?? row.created_at ?? ''),
  };
}

export function rowToContract(
  row: Record<string, unknown>,
  parties: AtlasContractParty[] = [],
  attachments: AtlasContractAttachment[] = [],
): AtlasContract {
  const computedStatus = computeContractStatus({
    status: String(row.status ?? 'active'),
    terminated_at: row.terminated_at as string | null,
    expiry_date: row.expiry_date as string | null,
    renewal_date: row.renewal_date as string | null,
    renewal_notice_days: Number(row.renewal_notice_days ?? 30),
  });

  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    title: String(row.title ?? ''),
    contractType: row.contract_type as ContractType,
    status: row.status as ContractStatus,
    computedStatus,
    effectiveDate: (row.effective_date as string | null) ?? null,
    expiryDate: (row.expiry_date as string | null) ?? null,
    renewalDate: (row.renewal_date as string | null) ?? null,
    renewalTerms: (row.renewal_terms as string | null) ?? null,
    autoRenew: Boolean(row.auto_renew),
    renewalNoticeDays: Number(row.renewal_notice_days ?? 30),
    alertDays: Array.isArray(row.alert_days)
      ? (row.alert_days as number[])
      : [...DEFAULT_CONTRACT_ALERT_DAYS],
    contractValue: row.contract_value != null ? Number(row.contract_value) : null,
    currency: String(row.currency ?? 'MAD'),
    notes: (row.notes as string | null) ?? null,
    legalDocumentId: (row.legal_document_id as string | null) ?? null,
    terminatedAt: (row.terminated_at as string | null) ?? null,
    terminationReason: (row.termination_reason as string | null) ?? null,
    daysUntilExpiry: daysUntil(row.expiry_date as string | null),
    daysUntilRenewal: daysUntil(row.renewal_date as string | null),
    parties,
    attachments,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function rowToEvent(row: Record<string, unknown>): AtlasContractEvent {
  return {
    id: String(row.id),
    contractId: String(row.contract_id),
    eventType: String(row.event_type ?? ''),
    channel: (row.channel as string | null) ?? null,
    title: String(row.title ?? ''),
    body: (row.body as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

async function loadPartiesAndAttachments(
  admin: SupabaseClient,
  contractIds: string[],
): Promise<{ parties: Map<string, AtlasContractParty[]>; attachments: Map<string, AtlasContractAttachment[]> }> {
  const parties = new Map<string, AtlasContractParty[]>();
  const attachments = new Map<string, AtlasContractAttachment[]>();

  if (contractIds.length === 0) return { parties, attachments };

  const [{ data: partyRows }, { data: attachRows }] = await Promise.all([
    admin
      .from('zafirix_contract_parties')
      .select('*')
      .in('contract_id', contractIds)
      .order('sort_order', { ascending: true }),
    admin
      .from('zafirix_contract_attachments')
      .select('*')
      .in('contract_id', contractIds)
      .order('uploaded_at', { ascending: false }),
  ]);

  for (const p of partyRows ?? []) {
    const cid = String(p.contract_id);
    const list = parties.get(cid) ?? [];
    list.push(rowToParty(p as Record<string, unknown>));
    parties.set(cid, list);
  }

  for (const a of attachRows ?? []) {
    const cid = String(a.contract_id);
    const list = attachments.get(cid) ?? [];
    list.push(rowToAttachment(a as Record<string, unknown>));
    attachments.set(cid, list);
  }

  return { parties, attachments };
}

function buildSummary(contracts: AtlasContract[]): ContractDashboardSummary {
  const summary: ContractDashboardSummary = {
    active: 0,
    expiring: 0,
    terminated: 0,
    draft: 0,
    renewed: 0,
    total: contracts.length,
    totalValue: 0,
  };

  for (const c of contracts) {
    const s = c.computedStatus;
    if (s === 'active') summary.active++;
    else if (s === 'expiring') summary.expiring++;
    else if (s === 'terminated') summary.terminated++;
    else if (s === 'draft') summary.draft++;
    else if (s === 'renewed') summary.renewed++;
    if (c.contractValue && s !== 'terminated') summary.totalValue += c.contractValue;
  }

  return summary;
}

/** Import contracts from zafirix_legal_documents (Documents IA routing). */
export async function syncContractsFromLegalDocuments(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { data: docs } = await admin
    .from('zafirix_legal_documents')
    .select('id, title, parties, effective_date, expiry_date, renewal_alert_days, obligations, document_type')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .in('document_type', ['legal_contract', 'hr_document']);

  let imported = 0;

  for (const doc of docs ?? []) {
    const { data: existing } = await admin
      .from('zafirix_contracts')
      .select('id')
      .eq('legal_document_id', doc.id)
      .maybeSingle();

    if (existing) continue;

    const { data: contract, error } = await admin
      .from('zafirix_contracts')
      .insert({
        user_id: userId,
        company_id: companyId,
        title: doc.title ?? 'Contrat importé',
        contract_type: doc.document_type === 'hr_document' ? 'employment' : 'commercial',
        status: 'active',
        effective_date: doc.effective_date,
        expiry_date: doc.expiry_date,
        renewal_notice_days: Number(doc.renewal_alert_days ?? 30),
        renewal_terms: doc.obligations ?? null,
        legal_document_id: doc.id,
      })
      .select('id')
      .single();

    if (error || !contract) continue;

    const partyNames = (doc.parties as string[] | null) ?? [];
    for (let i = 0; i < partyNames.length; i++) {
      await admin.from('zafirix_contract_parties').insert({
        user_id: userId,
        company_id: companyId,
        contract_id: contract.id,
        party_name: partyNames[i],
        party_role: i === 0 ? 'client' : 'other',
        sort_order: i,
      });
    }

    imported++;
  }

  return imported;
}

export async function recordContractEvent(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    contractId: string;
    eventType: string;
    channel?: string;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from('zafirix_contract_events').insert({
    user_id: input.userId,
    company_id: input.companyId,
    contract_id: input.contractId,
    event_type: input.eventType,
    channel: input.channel ?? null,
    title: input.title,
    body: input.body ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function getContractsPayload(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  opts?: { status?: ContractStatus | 'all'; sync?: boolean },
): Promise<ContractsPayload> {
  if (opts?.sync !== false) {
    await syncContractsFromLegalDocuments(admin, userId, companyId);
    await refreshContractStatuses(admin, userId, companyId);
  }

  const { data: rows } = await admin
    .from('zafirix_contracts')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .limit(200);

  const ids = (rows ?? []).map((r) => String(r.id));
  const { parties, attachments } = await loadPartiesAndAttachments(admin, ids);

  let contracts = (rows ?? []).map((r) =>
    rowToContract(
      r as Record<string, unknown>,
      parties.get(String(r.id)) ?? [],
      attachments.get(String(r.id)) ?? [],
    ),
  );

  if (opts?.status && opts.status !== 'all') {
    contracts = contracts.filter((c) => c.computedStatus === opts.status);
  }

  const { data: eventRows } = await admin
    .from('zafirix_contract_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  const allRows = (rows ?? []).map((r) =>
    rowToContract(
      r as Record<string, unknown>,
      parties.get(String(r.id)) ?? [],
      attachments.get(String(r.id)) ?? [],
    ),
  );

  return {
    contracts,
    summary: buildSummary(allRows),
    events: (eventRows ?? []).map((e) => rowToEvent(e as Record<string, unknown>)),
  };
}

export async function refreshContractStatuses(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const { data: rows } = await admin
    .from('zafirix_contracts')
    .select('id, status, terminated_at, expiry_date, renewal_date, renewal_notice_days')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('status', ['active', 'expiring']);

  for (const row of rows ?? []) {
    const computed = computeContractStatus({
      status: String(row.status ?? 'active'),
      terminated_at: row.terminated_at as string | null,
      expiry_date: row.expiry_date as string | null,
      renewal_date: row.renewal_date as string | null,
      renewal_notice_days: Number(row.renewal_notice_days ?? 30),
    });
    if (computed !== row.status && computed !== 'terminated') {
      await admin
        .from('zafirix_contracts')
        .update({ status: computed, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    } else if (computed === 'terminated' && row.status !== 'terminated') {
      await admin
        .from('zafirix_contracts')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
  }
}

export async function createContract(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    title: string;
    reference?: string;
    contractType?: ContractType;
    effectiveDate?: string;
    expiryDate?: string;
    renewalDate?: string;
    renewalTerms?: string;
    autoRenew?: boolean;
    renewalNoticeDays?: number;
    contractValue?: number;
    currency?: string;
    notes?: string;
    parties?: Array<{ partyName: string; partyRole?: ContractPartyRole; contactEmail?: string; contactPhone?: string }>;
    attachments?: Array<{ fileName: string; fileUrl?: string; documentType?: string }>;
  },
): Promise<AtlasContract> {
  const { data: row, error } = await admin
    .from('zafirix_contracts')
    .insert({
      user_id: userId,
      company_id: companyId,
      title: input.title,
      reference: input.reference ?? null,
      contract_type: input.contractType ?? 'commercial',
      status: 'active',
      effective_date: input.effectiveDate ?? null,
      expiry_date: input.expiryDate ?? null,
      renewal_date: input.renewalDate ?? null,
      renewal_terms: input.renewalTerms ?? null,
      auto_renew: input.autoRenew ?? false,
      renewal_notice_days: input.renewalNoticeDays ?? 30,
      contract_value: input.contractValue ?? null,
      currency: input.currency ?? 'MAD',
      notes: input.notes ?? null,
    })
    .select('*')
    .single();

  if (error || !row) throw new Error(error?.message ?? 'contract_create_failed');

  const contractId = String(row.id);

  for (let i = 0; i < (input.parties ?? []).length; i++) {
    const p = input.parties![i];
    await admin.from('zafirix_contract_parties').insert({
      user_id: userId,
      company_id: companyId,
      contract_id: contractId,
      party_name: p.partyName,
      party_role: p.partyRole ?? 'other',
      contact_email: p.contactEmail ?? null,
      contact_phone: p.contactPhone ?? null,
      sort_order: i,
    });
  }

  for (const a of input.attachments ?? []) {
    await admin.from('zafirix_contract_attachments').insert({
      user_id: userId,
      company_id: companyId,
      contract_id: contractId,
      file_name: a.fileName,
      file_url: a.fileUrl ?? null,
      document_type: a.documentType ?? 'contract',
    });
  }

  await recordContractEvent(admin, {
    userId,
    companyId,
    contractId,
    eventType: 'created',
    title: `Contrat créé — ${input.title}`,
  });

  const { parties, attachments } = await loadPartiesAndAttachments(admin, [contractId]);
  return rowToContract(row as Record<string, unknown>, parties.get(contractId) ?? [], attachments.get(contractId) ?? []);
}

export async function terminateContract(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  contractId: string,
  reason?: string,
): Promise<AtlasContract | null> {
  const { data, error } = await admin
    .from('zafirix_contracts')
    .update({
      status: 'terminated',
      terminated_at: new Date().toISOString(),
      termination_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) return null;

  await recordContractEvent(admin, {
    userId,
    companyId,
    contractId,
    eventType: 'terminated',
    title: `Contrat résilié — ${data.title}`,
    body: reason ?? undefined,
  });

  const { parties, attachments } = await loadPartiesAndAttachments(admin, [contractId]);
  return rowToContract(data as Record<string, unknown>, parties.get(contractId) ?? [], attachments.get(contractId) ?? []);
}

export async function renewContract(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  contractId: string,
  input: { newExpiryDate?: string; newRenewalDate?: string; notes?: string },
): Promise<AtlasContract | null> {
  const { data: current } = await admin
    .from('zafirix_contracts')
    .select('*')
    .eq('id', contractId)
    .eq('user_id', userId)
    .single();

  if (!current) return null;

  await admin
    .from('zafirix_contracts')
    .update({ status: 'renewed', updated_at: new Date().toISOString() })
    .eq('id', contractId);

  const { data: renewed, error } = await admin
    .from('zafirix_contracts')
    .insert({
      user_id: userId,
      company_id: companyId,
      reference: current.reference,
      title: `${current.title} (renouvelé)`,
      contract_type: current.contract_type,
      status: 'active',
      effective_date: input.newExpiryDate ? null : current.expiry_date,
      expiry_date: input.newExpiryDate ?? null,
      renewal_date: input.newRenewalDate ?? null,
      renewal_terms: current.renewal_terms,
      auto_renew: current.auto_renew,
      renewal_notice_days: current.renewal_notice_days,
      alert_days: current.alert_days,
      contract_value: current.contract_value,
      currency: current.currency,
      notes: input.notes ?? current.notes,
      metadata: { ...(current.metadata as object), renewed_from: contractId },
    })
    .select('*')
    .single();

  if (error || !renewed) return null;

  await recordContractEvent(admin, {
    userId,
    companyId,
    contractId,
    eventType: 'renewed',
    title: `Contrat renouvelé — ${current.title}`,
    body: input.newExpiryDate ? `Nouvelle échéance : ${input.newExpiryDate}` : undefined,
    metadata: { newContractId: renewed.id },
  });

  const newId = String(renewed.id);
  const { parties, attachments } = await loadPartiesAndAttachments(admin, [newId]);
  return rowToContract(renewed as Record<string, unknown>, parties.get(newId) ?? [], attachments.get(newId) ?? []);
}

type AlertTarget = { kind: 'expiry' | 'renewal'; date: string; daysRemaining: number };

function alertTargetsForContract(c: AtlasContract): AlertTarget[] {
  const targets: AlertTarget[] = [];
  if (c.computedStatus === 'terminated' || c.computedStatus === 'renewed' || c.computedStatus === 'draft') {
    return targets;
  }
  if (c.expiryDate) {
    const d = c.daysUntilExpiry;
    if (d !== null) targets.push({ kind: 'expiry', date: c.expiryDate, daysRemaining: d });
  }
  if (c.renewalDate) {
    const d = c.daysUntilRenewal;
    if (d !== null) targets.push({ kind: 'renewal', date: c.renewalDate, daysRemaining: d });
  }
  return targets;
}

/** Scan contracts and alert management at configured thresholds (weeks before expiry/renewal). */
export async function scanAndAlertContractRenewals(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ synced: number; alerted: number }> {
  await syncContractsFromLegalDocuments(admin, userId, companyId);
  await refreshContractStatuses(admin, userId, companyId);

  const payload = await getContractsPayload(admin, userId, companyId, { sync: false });
  const contacts = await resolveManagerContacts(admin, userId, companyId);
  let alerted = 0;

  for (const c of payload.contracts) {
    if (c.computedStatus === 'terminated' || c.computedStatus === 'renewed' || c.computedStatus === 'draft') {
      continue;
    }

    const thresholds = c.alertDays.length ? c.alertDays : [...DEFAULT_CONTRACT_ALERT_DAYS];
    const maxDays = Math.max(...thresholds);

    for (const target of alertTargetsForContract(c)) {
      if (target.daysRemaining > maxDays) continue;

      const threshold = matchingThreshold(target.daysRemaining, thresholds);
      if (threshold === null) continue;

      const isRenewal = target.kind === 'renewal';
      const title =
        target.daysRemaining <= 0
          ? `${isRenewal ? 'Renouvellement' : 'Expiration'} — ${c.title}`
          : `${isRenewal ? 'Renouvellement' : 'Expiration'} contrat — J-${Math.max(target.daysRemaining, 0)}`;
      const body = isRenewal
        ? `Le contrat « ${c.title} » arrive à renouvellement le ${target.date}.${c.autoRenew ? ' Renouvellement automatique activé.' : ''}${c.renewalTerms ? ` Conditions : ${c.renewalTerms}` : ''}`
        : `Le contrat « ${c.title} » expire le ${target.date}. Préparez le renouvellement ou la résiliation.`;

      alerted += await enqueueManagerAlert(admin, contacts, {
        userId,
        companyId,
        category: 'contract_expiry',
        title,
        body,
        entityType: 'legal_contract',
        entityId: c.id,
        dedupeKey: contractDedupeKey(c.id, target.kind, threshold, 'all'),
        metadata: { kind: target.kind, threshold, expiryDate: c.expiryDate, renewalDate: c.renewalDate },
      });

      await recordContractEvent(admin, {
        userId,
        companyId,
        contractId: c.id,
        eventType: isRenewal ? 'renewal_alert' : 'expiry_alert',
        channel: 'all',
        title,
        body,
        metadata: { threshold, daysRemaining: target.daysRemaining },
      });
    }
  }

  await processNotificationQueue(admin, { limit: 50, companyId });
  return { synced: payload.contracts.length, alerted };
}
