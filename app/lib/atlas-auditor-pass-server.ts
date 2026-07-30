/**
 * Auditor guest pass — token validation, RBAC, portal data, verification exports.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { asRecord } from '@/app/lib/atlas-json';
import { getReportsDashboard, resolveReportPeriod } from '@/app/lib/atlas-reports-server';
import type {
  AtlasAuditorPassSession,
  AuditorAccessAction,
  AuditorJournalLine,
  AuditorLedgerAccount,
  AuditorPermission,
  AuditorPortalPayload,
  AuditorRole,
  AuditorScope,
  AuditorVerificationReport,
} from '@/app/types/atlas-auditor-pass';
import { DEFAULT_ROLE_PERMISSIONS } from '@/app/types/atlas-auditor-pass';

export { DEFAULT_ROLE_PERMISSIONS, AUDITOR_ROLE_LABELS, AUDITOR_SCOPE_LABELS } from '@/app/types/atlas-auditor-pass';

export type ValidatedPass = AtlasAuditorPassSession & { token: string };

export class AuditorPassError extends Error {
  constructor(
    public code: 'invalid_token' | 'expired' | 'revoked' | 'forbidden',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuditorPassError';
  }
}

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolvePassPermissions(
  role: AuditorRole,
  scope: AuditorScope,
  customPermissions?: string[] | null,
): AuditorPermission[] {
  const base = customPermissions?.length
    ? (customPermissions.filter((p) =>
        DEFAULT_ROLE_PERMISSIONS.expert_comptable.includes(p as AuditorPermission),
      ) as AuditorPermission[])
    : [...DEFAULT_ROLE_PERMISSIONS[role]];

  if (scope !== 'audit_export') {
    return base.filter((p) => p !== 'export_verification');
  }
  return base;
}

export function hasAuditorPermission(
  session: Pick<AtlasAuditorPassSession, 'permissions'>,
  permission: AuditorPermission,
): boolean {
  return session.permissions.includes(permission);
}

export async function validateAuditorPass(
  admin: SupabaseClient,
  token: string,
): Promise<ValidatedPass> {
  const { data: pass, error } = await admin
    .from('zafirix_auditor_passes')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !pass) throw new AuditorPassError('invalid_token');
  if (pass.revoked_at) throw new AuditorPassError('revoked');
  if (new Date(pass.expires_at as string) < new Date()) throw new AuditorPassError('expired');

  const companyId = pass.company_id as string | null;
  if (!companyId) throw new AuditorPassError('invalid_token');

  const { data: company } = await admin
    .from('atlas_companies')
    .select('name, company_json')
    .eq('id', companyId)
    .maybeSingle();

  const json = asRecord(company?.company_json);
  const companyName = String(company?.name ?? json?.raisonSociale ?? 'Société');

  const role = (pass.auditor_role ?? 'external_auditor') as AuditorRole;
  const scope = pass.scope as AuditorScope;
  const permissions = resolvePassPermissions(role, scope, pass.permissions as string[] | null);

  return {
    token,
    passId: String(pass.id),
    companyId,
    userId: String(pass.user_id),
    label: String(pass.label),
    scope,
    auditorRole: role,
    permissions,
    expiresAt: String(pass.expires_at),
    auditorEmail: (pass.auditor_email as string | null) ?? null,
    auditorFirm: (pass.auditor_firm as string | null) ?? null,
    companyName,
  };
}

export async function recordAuditorAccess(
  admin: SupabaseClient,
  pass: ValidatedPass,
  action: AuditorAccessAction,
  opts?: { resource?: string; ip?: string; userAgent?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await admin.from('zafirix_auditor_access_log').insert({
    pass_id: pass.passId,
    company_id: pass.companyId,
    action,
    resource: opts?.resource ?? null,
    ip_address: opts?.ip ?? null,
    user_agent: opts?.userAgent ?? null,
    metadata: opts?.metadata ?? {},
  });

  const { data: current } = await admin
    .from('zafirix_auditor_passes')
    .select('access_count')
    .eq('id', pass.passId)
    .single();

  await admin
    .from('zafirix_auditor_passes')
    .update({
      access_count: Number(current?.access_count ?? 0) + 1,
      last_access_at: new Date().toISOString(),
      last_access_ip: opts?.ip ?? null,
    })
    .eq('id', pass.passId);
}

function flattenJournalLine(row: Record<string, unknown>): AuditorJournalLine | null {
  const entry = asRecord(row.entry_json);
  if (!entry) return null;
  return {
    id: String(row.id),
    date: String(entry.date ?? row.entry_date ?? ''),
    libelle: String(entry.libelle ?? ''),
    compte: String(entry.compte ?? ''),
    debit: Number(entry.debit ?? 0),
    credit: Number(entry.credit ?? 0),
    validationStatus: String(row.validation_status ?? 'draft'),
    sourceDocumentId: row.source_document_id ? String(row.source_document_id) : null,
  };
}

export function buildLedgerFromJournal(lines: AuditorJournalLine[]): AuditorLedgerAccount[] {
  const byAccount = new Map<string, AuditorLedgerAccount>();

  for (const line of lines) {
    const key = line.compte || '—';
    const existing = byAccount.get(key) ?? {
      compte: key,
      libelle: line.libelle,
      totalDebit: 0,
      totalCredit: 0,
      balance: 0,
      lineCount: 0,
    };
    existing.totalDebit += line.debit;
    existing.totalCredit += line.credit;
    existing.lineCount += 1;
    if (!existing.libelle && line.libelle) existing.libelle = line.libelle;
    byAccount.set(key, existing);
  }

  return [...byAccount.values()]
    .map((a) => ({
      ...a,
      totalDebit: roundMad(a.totalDebit),
      totalCredit: roundMad(a.totalCredit),
      balance: roundMad(a.totalDebit - a.totalCredit),
    }))
    .sort((a, b) => a.compte.localeCompare(b.compte));
}

async function loadJournalLines(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  limit = 500,
): Promise<AuditorJournalLine[]> {
  const { data } = await admin
    .from('atlas_accounting_entries')
    .select('id, entry_json, entry_date, source_document_id, validation_status')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .order('entry_date', { ascending: false })
    .limit(limit);

  return (data ?? [])
    .map((r) => flattenJournalLine(r as Record<string, unknown>))
    .filter((l): l is AuditorJournalLine => l != null);
}

export async function buildAuditorPortalPayload(
  admin: SupabaseClient,
  pass: ValidatedPass,
  view: 'dashboard' | 'journal' | 'ledger' | 'invoices' | 'payments' | 'bank' | 'full' = 'dashboard',
): Promise<AuditorPortalPayload> {
  const sessionPublic = {
    label: pass.label,
    scope: pass.scope,
    auditorRole: pass.auditorRole,
    permissions: pass.permissions,
    expiresAt: pass.expiresAt,
    auditorEmail: pass.auditorEmail,
    auditorFirm: pass.auditorFirm,
    companyName: pass.companyName,
    companyId: pass.companyId,
  };

  const journalLines = hasAuditorPermission(pass, 'view_journal') || hasAuditorPermission(pass, 'view_ledger')
    ? await loadJournalLines(admin, pass.userId, pass.companyId)
    : [];

  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0);

  const payload: AuditorPortalPayload = {
    session: sessionPublic,
    summary: {
      invoiceCount: 0,
      documentCount: 0,
      contractCount: 0,
      journalLineCount: journalLines.length,
      journalBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    },
  };

  if (view === 'journal' || view === 'full') {
    if (hasAuditorPermission(pass, 'view_journal')) {
      payload.journal = journalLines;
    }
  }

  if (view === 'ledger' || view === 'full') {
    if (hasAuditorPermission(pass, 'view_ledger')) {
      payload.ledger = buildLedgerFromJournal(journalLines);
    }
  }

  const needInvoices = view === 'invoices' || view === 'dashboard' || view === 'full';
  if (needInvoices && hasAuditorPermission(pass, 'view_invoices')) {
    const { data: invoices } = await admin
      .from('atlas_invoices')
      .select('id, number, client_name, total_ttc, status, due_date, issue_date')
      .eq('company_id', pass.companyId)
      .order('issue_date', { ascending: false })
      .limit(100);

    payload.invoices = (invoices ?? []).map((inv) => ({
      id: String(inv.id),
      number: String(inv.number ?? ''),
      clientName: String(inv.client_name ?? ''),
      totalTtc: Number(inv.total_ttc ?? 0),
      status: String(inv.status ?? ''),
      dueDate: (inv.due_date as string | null) ?? null,
      issueDate: (inv.issue_date as string | null) ?? null,
    }));
    payload.summary.invoiceCount = payload.invoices.length;
  }

  if ((view === 'payments' || view === 'full') && hasAuditorPermission(pass, 'view_payments')) {
    const { data: payments } = await admin
      .from('atlas_payments')
      .select('id, invoice_id, paid_amount, amount, paid_at, method')
      .eq('company_id', pass.companyId)
      .order('paid_at', { ascending: false })
      .limit(100);

    payload.payments = (payments ?? []).map((p) => ({
      id: String(p.id),
      invoiceId: (p.invoice_id as string | null) ?? null,
      amount: Number(p.paid_amount ?? p.amount ?? 0),
      paidAt: (p.paid_at as string | null) ?? null,
      method: (p.method as string | null) ?? null,
    }));
  }

  if ((view === 'bank' || view === 'full') && hasAuditorPermission(pass, 'view_bank')) {
    const { data: tx } = await admin
      .from('zafirix_bank_transactions')
      .select('id, description, debit, credit, transaction_date')
      .eq('company_id', pass.companyId)
      .order('transaction_date', { ascending: false })
      .limit(100);

    payload.bankTransactions = (tx ?? []).map((t) => ({
      id: String(t.id),
      label: String(t.description ?? ''),
      debit: Number(t.debit ?? 0),
      credit: Number(t.credit ?? 0),
      transactionDate: (t.transaction_date as string | null) ?? null,
    }));
  }

  if (view === 'dashboard' || view === 'full') {
    if (hasAuditorPermission(pass, 'view_documents')) {
      const { data: docs } = await admin
        .from('atlas_documents')
        .select('id')
        .eq('company_id', pass.companyId)
        .limit(100);
      payload.summary.documentCount = docs?.length ?? 0;
    }

    if (hasAuditorPermission(pass, 'view_contracts')) {
      const { data: contracts } = await admin
        .from('zafirix_legal_documents')
        .select('id, title, expiry_date, document_type')
        .eq('company_id', pass.companyId)
        .limit(50);

      payload.contracts = (contracts ?? []).map((c) => ({
        id: String(c.id),
        title: String(c.title ?? '—'),
        expiryDate: (c.expiry_date as string | null) ?? null,
        documentType: String(c.document_type ?? ''),
      }));
      payload.summary.contractCount = payload.contracts.length;
    }
  }

  return payload;
}

export async function buildVerificationReport(
  admin: SupabaseClient,
  pass: ValidatedPass,
): Promise<AuditorVerificationReport> {
  if (!hasAuditorPermission(pass, 'export_verification')) {
    throw new AuditorPassError('forbidden', 'Export non autorisé pour ce pass.');
  }

  const period = resolveReportPeriod('year');
  const dashboard = await getReportsDashboard(admin, pass.userId, pass.companyId, period);
  const journalLines = await loadJournalLines(admin, pass.userId, pass.companyId, 1000);
  const ledger = buildLedgerFromJournal(journalLines);
  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0);

  const [{ count: paymentCount }, { count: bankCount }] = await Promise.all([
    admin.from('atlas_payments').select('id', { count: 'exact', head: true }).eq('company_id', pass.companyId),
    admin.from('zafirix_bank_transactions').select('id', { count: 'exact', head: true }).eq('company_id', pass.companyId),
  ]);

  const report: AuditorVerificationReport = {
    generatedAt: new Date().toISOString(),
    passLabel: pass.label,
    auditorRole: pass.auditorRole,
    companyName: pass.companyName,
    companyId: pass.companyId,
    periodLabel: dashboard.period.periodLabel,
    journal: {
      lineCount: journalLines.length,
      totalDebit: roundMad(totalDebit),
      totalCredit: roundMad(totalCredit),
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    },
    ledger,
    summary: {
      invoiceCount: dashboard.kpis.facturesEmises,
      unpaidAmount: dashboard.kpis.facturesImpayeesMontant,
      paymentCount: paymentCount ?? 0,
      bankTransactionCount: bankCount ?? 0,
      contractCount: 0,
    },
    integrityHash: '',
  };

  report.integrityHash = createHash('sha256')
    .update(JSON.stringify({ ...report, integrityHash: undefined }))
    .digest('hex')
    .slice(0, 16);

  return report;
}

export function verificationReportToCsv(report: AuditorVerificationReport): string {
  const lines: string[] = [
    'RAPPORT DE VÉRIFICATION AUDITEUR — ZAFIRIX PRO',
    `Société;${report.companyName}`,
    `Pass;${report.passLabel}`,
    `Rôle;${report.auditorRole}`,
    `Période;${report.periodLabel}`,
    `Généré;${report.generatedAt}`,
    `Hash intégrité;${report.integrityHash}`,
    '',
    'JOURNAL',
    `Lignes;${report.journal.lineCount}`,
    `Total débit;${report.journal.totalDebit}`,
    `Total crédit;${report.journal.totalCredit}`,
    `Équilibré;${report.journal.balanced ? 'Oui' : 'Non'}`,
    '',
    'GRAND-LIVRE',
    'Compte;Débit;Crédit;Solde;Lignes',
    ...report.ledger.map(
      (a) => `${a.compte};${a.totalDebit};${a.totalCredit};${a.balance};${a.lineCount}`,
    ),
    '',
    'SYNTHÈSE',
    `Factures émises;${report.summary.invoiceCount}`,
    `Montant impayés;${report.summary.unpaidAmount}`,
    `Paiements;${report.summary.paymentCount}`,
    `Mouvements bancaires;${report.summary.bankTransactionCount}`,
  ];
  return lines.join('\n');
}
