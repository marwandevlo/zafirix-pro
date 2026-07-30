/**
 * Petty cash server — funds, vouchers, approvals, accounting reconciliation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { persistJournalLines } from '@/app/lib/atlas-documents-accounting-engine';
import type {
  AtlasPettyCashApproval,
  AtlasPettyCashAttachment,
  AtlasPettyCashEntry,
  AtlasPettyCashFund,
  AtlasPettyCashReconciliation,
  AtlasPettyCashVoucher,
  PettyCashVoucherStatus,
} from '@/app/types/atlas-petty-cash';

export const DEFAULT_PETTY_CASH_ACCOUNT = '516100';
export const DEFAULT_EXPENSE_ACCOUNT = '618000';

export const EXPENSE_CATEGORIES: Record<string, { label: string; account: string }> = {
  charges_diverses: { label: 'Charges diverses', account: '618000' },
  fournitures: { label: 'Fournitures de bureau', account: '612100' },
  deplacement: { label: 'Déplacements & missions', account: '614700' },
  reception: { label: 'Réception & représentation', account: '614500' },
  entretien: { label: 'Entretien & réparations', account: '614400' },
  telecom: { label: 'Télécommunications', account: '614200' },
};

export function rowToFund(row: Record<string, unknown>): AtlasPettyCashFund {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    name: String(row.name ?? ''),
    code: String(row.code ?? ''),
    floatAmount: Number(row.float_amount ?? 0),
    accountingAccount: String(row.accounting_account ?? DEFAULT_PETTY_CASH_ACCOUNT),
    custodianName: (row.custodian_name as string | null) ?? null,
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ''),
    currentBalance: Number(row.current_balance ?? 0),
    pendingAmount: Number(row.pending_amount ?? 0),
  };
}

export function rowToVoucher(row: Record<string, unknown>, attachments?: AtlasPettyCashAttachment[]): AtlasPettyCashVoucher {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    fundId: String(row.fund_id),
    voucherNumber: String(row.voucher_number ?? ''),
    voucherDate: String(row.voucher_date ?? ''),
    amount: Number(row.amount ?? 0),
    beneficiary: (row.beneficiary as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    expenseCategory: String(row.expense_category ?? 'charges_diverses'),
    expenseAccount: String(row.expense_account ?? DEFAULT_EXPENSE_ACCOUNT),
    status: row.status as PettyCashVoucherStatus,
    entryId: (row.entry_id as string | null) ?? null,
    reconciledAt: (row.reconciled_at as string | null) ?? null,
    accountingPosted: row.accounting_posted === true,
    createdAt: String(row.created_at ?? ''),
    fundName: (row.fund_name as string | undefined) ?? undefined,
    attachments: attachments ?? [],
  };
}

export function rowToAttachment(row: Record<string, unknown>): AtlasPettyCashAttachment {
  return {
    id: String(row.id),
    voucherId: String(row.voucher_id),
    fileName: String(row.file_name ?? ''),
    fileUrl: String(row.file_url ?? ''),
    mimeType: (row.mime_type as string | null) ?? null,
    fileSize: row.file_size != null ? Number(row.file_size) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToApproval(row: Record<string, unknown>): AtlasPettyCashApproval {
  return {
    id: String(row.id),
    voucherId: String(row.voucher_id),
    step: row.step as AtlasPettyCashApproval['step'],
    actorName: (row.actor_name as string | null) ?? null,
    actorRole: (row.actor_role as string | null) ?? null,
    comment: (row.comment as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToEntry(row: Record<string, unknown>): AtlasPettyCashEntry {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    fundId: (row.fund_id as string | null) ?? null,
    voucherId: (row.voucher_id as string | null) ?? null,
    entryType: row.entry_type as AtlasPettyCashEntry['entryType'],
    amount: Number(row.amount ?? 0),
    beneficiary: (row.beneficiary as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    status: row.status as AtlasPettyCashEntry['status'],
    entryDate: String(row.entry_date ?? ''),
    approvedBy: (row.approved_by as string | null) ?? null,
    accountingAccount: (row.accounting_account as string | null) ?? null,
    reconciledAt: (row.reconciled_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

/** Compute fund balance from approved ledger entries. */
export function computeFundBalance(
  entries: AtlasPettyCashEntry[],
  fundId: string,
): { currentBalance: number; pendingAmount: number } {
  let currentBalance = 0;
  let pendingAmount = 0;

  for (const e of entries) {
    if (e.fundId !== fundId) continue;
    const signed = e.entryType === 'replenishment' ? e.amount : -e.amount;
    if (e.status === 'approved' || e.status === 'reimbursed') {
      currentBalance += signed;
    } else if (e.status === 'pending') {
      pendingAmount += e.amount;
    }
  }

  return { currentBalance, pendingAmount };
}

async function nextVoucherNumber(admin: SupabaseClient, fundId: string): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await admin
    .from('zafirix_petty_cash_vouchers')
    .select('id', { count: 'exact', head: true })
    .eq('fund_id', fundId);
  const seq = (count ?? 0) + 1;
  return `PC-${year}-${String(seq).padStart(4, '0')}`;
}

export async function createPettyCashFund(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    name: string;
    code?: string;
    floatAmount: number;
    accountingAccount?: string;
    custodianName?: string;
  },
): Promise<{ ok: true; fund: AtlasPettyCashFund } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('zafirix_petty_cash_funds')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      name: input.name,
      code: input.code ?? input.name.slice(0, 6).toUpperCase(),
      float_amount: input.floatAmount,
      accounting_account: input.accountingAccount ?? DEFAULT_PETTY_CASH_ACCOUNT,
      custodian_name: input.custodianName ?? null,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  const fund = rowToFund(data as Record<string, unknown>);

  if (input.floatAmount > 0) {
    await admin.from('zafirix_petty_cash_entries').insert({
      user_id: input.userId,
      company_id: input.companyId,
      fund_id: fund.id,
      entry_type: 'replenishment',
      amount: input.floatAmount,
      purpose: `Dotation initiale — ${input.name}`,
      status: 'approved',
      entry_date: new Date().toISOString().slice(0, 10),
      accounting_account: input.accountingAccount ?? DEFAULT_PETTY_CASH_ACCOUNT,
    });
    fund.currentBalance = input.floatAmount;
  }

  return { ok: true, fund };
}

export async function createExpenseVoucher(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    fundId: string;
    amount: number;
    beneficiary?: string;
    purpose?: string;
    expenseCategory?: string;
    voucherDate?: string;
    attachments?: Array<{ fileName: string; fileUrl: string; mimeType?: string; fileSize?: number }>;
  },
): Promise<{ ok: true; voucher: AtlasPettyCashVoucher } | { ok: false; error: string }> {
  if (input.amount <= 0) return { ok: false, error: 'invalid_amount' };

  const cat = EXPENSE_CATEGORIES[input.expenseCategory ?? 'charges_diverses'] ?? EXPENSE_CATEGORIES.charges_diverses;
  const voucherNumber = await nextVoucherNumber(admin, input.fundId);

  const { data, error } = await admin
    .from('zafirix_petty_cash_vouchers')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      fund_id: input.fundId,
      voucher_number: voucherNumber,
      voucher_date: input.voucherDate ?? new Date().toISOString().slice(0, 10),
      amount: input.amount,
      beneficiary: input.beneficiary ?? null,
      purpose: input.purpose ?? null,
      expense_category: input.expenseCategory ?? 'charges_diverses',
      expense_account: cat.account,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  const voucherId = String(data.id);
  const attachmentRows: AtlasPettyCashAttachment[] = [];

  for (const att of input.attachments ?? []) {
    const { data: attRow } = await admin
      .from('zafirix_petty_cash_attachments')
      .insert({
        user_id: input.userId,
        company_id: input.companyId,
        voucher_id: voucherId,
        file_name: att.fileName,
        file_url: att.fileUrl,
        mime_type: att.mimeType ?? null,
        file_size: att.fileSize ?? null,
      })
      .select('*')
      .single();
    if (attRow) attachmentRows.push(rowToAttachment(attRow as Record<string, unknown>));
  }

  return { ok: true, voucher: rowToVoucher(data as Record<string, unknown>, attachmentRows) };
}

async function recordApprovalStep(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    voucherId: string;
    step: AtlasPettyCashApproval['step'];
    actorName?: string;
    actorRole?: string;
    comment?: string;
  },
): Promise<void> {
  await admin.from('zafirix_petty_cash_approvals').insert({
    user_id: input.userId,
    company_id: input.companyId,
    voucher_id: input.voucherId,
    step: input.step,
    actor_name: input.actorName ?? null,
    actor_role: input.actorRole ?? null,
    comment: input.comment ?? null,
  });
}

export async function submitVoucherForApproval(
  admin: SupabaseClient,
  input: { userId: string; companyId: string; voucherId: string; actorName?: string },
): Promise<{ ok: true; voucher: AtlasPettyCashVoucher } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('zafirix_petty_cash_vouchers')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', input.voucherId)
    .eq('user_id', input.userId)
    .in('status', ['draft'])
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: 'voucher_not_found' };

  await recordApprovalStep(admin, {
    ...input,
    step: 'submitted',
    actorName: input.actorName ?? 'Demandeur',
    actorRole: 'requester',
  });

  return { ok: true, voucher: rowToVoucher(data as Record<string, unknown>) };
}

export async function approveVoucher(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    voucherId: string;
    actorName?: string;
    actorRole?: string;
    comment?: string;
    postToAccounting?: boolean;
  },
): Promise<{ ok: true; voucher: AtlasPettyCashVoucher; entryId?: string } | { ok: false; error: string }> {
  const { data: voucher, error: fetchErr } = await admin
    .from('zafirix_petty_cash_vouchers')
    .select('*, zafirix_petty_cash_funds(name, accounting_account)')
    .eq('id', input.voucherId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (fetchErr || !voucher) return { ok: false, error: 'voucher_not_found' };
  if (voucher.status === 'approved' || voucher.status === 'posted') {
    return { ok: true, voucher: rowToVoucher(voucher as Record<string, unknown>), entryId: voucher.entry_id ?? undefined };
  }
  if (voucher.status !== 'pending') return { ok: false, error: 'invalid_status' };

  const fundJoin = voucher.zafirix_petty_cash_funds as { name?: string; accounting_account?: string } | null;
  const cashAccount = fundJoin?.accounting_account ?? DEFAULT_PETTY_CASH_ACCOUNT;

  const { data: entry, error: entryErr } = await admin
    .from('zafirix_petty_cash_entries')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      fund_id: voucher.fund_id,
      voucher_id: input.voucherId,
      entry_type: 'expense',
      amount: voucher.amount,
      beneficiary: voucher.beneficiary,
      purpose: voucher.purpose,
      status: 'approved',
      entry_date: voucher.voucher_date,
      approved_by: input.actorName ?? 'Gestionnaire',
      accounting_account: voucher.expense_account,
    })
    .select('id')
    .single();

  if (entryErr) return { ok: false, error: entryErr.message };

  let accountingEntryIds: string[] = [];
  if (input.postToAccounting !== false) {
    const ymd = String(voucher.voucher_date);
    const libelle = `Caisse ${voucher.voucher_number} — ${voucher.purpose ?? voucher.beneficiary ?? 'Dépense'}`;
    const amount = Number(voucher.amount);
    const journal = await persistJournalLines(admin, input.userId, input.companyId, [
      {
        date: ymd,
        libelle,
        compte: voucher.expense_account,
        debit: amount,
        credit: 0,
        source_document_id: input.voucherId,
        generated_by: 'petty_cash',
        validation_status: 'draft',
      },
      {
        date: ymd,
        libelle,
        compte: cashAccount,
        debit: 0,
        credit: amount,
        source_document_id: input.voucherId,
        generated_by: 'petty_cash',
        validation_status: 'draft',
      },
    ]);
    if (journal.ok) accountingEntryIds = journal.ids;

    await admin
      .from('zafirix_petty_cash_entries')
      .update({ accounting_entry_ids: accountingEntryIds })
      .eq('id', entry.id);
  }

  const { data: updated, error: updErr } = await admin
    .from('zafirix_petty_cash_vouchers')
    .update({
      status: input.postToAccounting !== false ? 'posted' : 'approved',
      entry_id: entry.id,
      accounting_posted: input.postToAccounting !== false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.voucherId)
    .select('*')
    .single();

  if (updErr) return { ok: false, error: updErr.message };

  await recordApprovalStep(admin, {
    ...input,
    step: 'approved',
    actorName: input.actorName ?? 'Gestionnaire',
    actorRole: input.actorRole ?? 'manager',
  });

  return {
    ok: true,
    voucher: rowToVoucher({ ...(updated as Record<string, unknown>), fund_name: fundJoin?.name }),
    entryId: String(entry.id),
  };
}

export async function rejectVoucher(
  admin: SupabaseClient,
  input: { userId: string; companyId: string; voucherId: string; actorName?: string; comment?: string },
): Promise<{ ok: true; voucher: AtlasPettyCashVoucher } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('zafirix_petty_cash_vouchers')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', input.voucherId)
    .eq('user_id', input.userId)
    .in('status', ['draft', 'pending'])
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: 'voucher_not_found' };

  await recordApprovalStep(admin, {
    ...input,
    step: 'rejected',
    actorName: input.actorName ?? 'Gestionnaire',
    actorRole: 'manager',
    comment: input.comment,
  });

  return { ok: true, voucher: rowToVoucher(data as Record<string, unknown>) };
}

/** Sum accounting entries for a PCG account (debit - credit). */
export async function getAccountingAccountBalance(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  accountPrefix: string,
): Promise<number> {
  const { data } = await admin
    .from('atlas_accounting_entries')
    .select('entry_json')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .limit(2000);

  let balance = 0;
  for (const row of data ?? []) {
    const j = row.entry_json as { compte?: string; debit?: number; credit?: number } | null;
    if (!j?.compte?.startsWith(accountPrefix)) continue;
    balance += Number(j.debit ?? 0) - Number(j.credit ?? 0);
  }
  return Math.round(balance * 100) / 100;
}

export async function reconcilePettyCashFund(
  admin: SupabaseClient,
  input: { userId: string; companyId: string; fundId: string },
): Promise<{ ok: true; reconciliation: AtlasPettyCashReconciliation } | { ok: false; error: string }> {
  const { data: fund, error: fundErr } = await admin
    .from('zafirix_petty_cash_funds')
    .select('*')
    .eq('id', input.fundId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (fundErr || !fund) return { ok: false, error: 'fund_not_found' };

  const { data: entries } = await admin
    .from('zafirix_petty_cash_entries')
    .select('*')
    .eq('fund_id', input.fundId)
    .eq('user_id', input.userId);

  const mapped = (entries ?? []).map((r) => rowToEntry(r as Record<string, unknown>));
  const { currentBalance } = computeFundBalance(mapped, input.fundId);
  const accountingAccount = String(fund.accounting_account ?? DEFAULT_PETTY_CASH_ACCOUNT);
  const accountingBalance = await getAccountingAccountBalance(
    admin,
    input.userId,
    input.companyId,
    accountingAccount,
  );

  const variance = Math.round((currentBalance - accountingBalance) * 100) / 100;
  const now = new Date().toISOString();

  await admin
    .from('zafirix_petty_cash_entries')
    .update({ reconciled_at: now })
    .eq('fund_id', input.fundId)
    .eq('user_id', input.userId)
    .in('status', ['approved', 'reimbursed']);

  await admin
    .from('zafirix_petty_cash_vouchers')
    .update({ status: 'reconciled', reconciled_at: now })
    .eq('fund_id', input.fundId)
    .eq('user_id', input.userId)
    .in('status', ['posted', 'approved']);

  return {
    ok: true,
    reconciliation: {
      fundId: input.fundId,
      fundName: String(fund.name),
      accountingAccount,
      physicalBalance: currentBalance,
      accountingBalance,
      variance,
      reconciledAt: now,
      isBalanced: Math.abs(variance) < 0.01,
    },
  };
}

export async function replenishFund(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    fundId: string;
    amount: number;
    purpose?: string;
    postToAccounting?: boolean;
  },
): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  if (input.amount <= 0) return { ok: false, error: 'invalid_amount' };

  const { data: fund } = await admin
    .from('zafirix_petty_cash_funds')
    .select('accounting_account, name')
    .eq('id', input.fundId)
    .maybeSingle();

  const cashAccount = String(fund?.accounting_account ?? DEFAULT_PETTY_CASH_ACCOUNT);

  const { data: entry, error } = await admin
    .from('zafirix_petty_cash_entries')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      fund_id: input.fundId,
      entry_type: 'replenishment',
      amount: input.amount,
      purpose: input.purpose ?? `Réapprovisionnement — ${fund?.name ?? ''}`,
      status: 'approved',
      entry_date: new Date().toISOString().slice(0, 10),
      accounting_account: cashAccount,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  if (input.postToAccounting !== false) {
    const ymd = new Date().toISOString().slice(0, 10);
    const libelle = input.purpose ?? `Réappro caisse — ${fund?.name ?? ''}`;
    await persistJournalLines(admin, input.userId, input.companyId, [
      { date: ymd, libelle, compte: cashAccount, debit: input.amount, credit: 0, source_document_id: input.fundId, generated_by: 'petty_cash', validation_status: 'draft' },
      { date: ymd, libelle, compte: '514100', debit: 0, credit: input.amount, source_document_id: input.fundId, generated_by: 'petty_cash', validation_status: 'draft' },
    ]);
  }

  return { ok: true, entryId: String(entry.id) };
}
