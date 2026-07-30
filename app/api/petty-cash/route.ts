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
  approveVoucher,
  computeFundBalance,
  createExpenseVoucher,
  createPettyCashFund,
  EXPENSE_CATEGORIES,
  reconcilePettyCashFund,
  rejectVoucher,
  replenishFund,
  rowToAttachment,
  rowToEntry,
  rowToFund,
  rowToVoucher,
  submitVoucherForApproval,
} from '@/app/lib/atlas-petty-cash-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const view = searchParams.get('view') ?? 'dashboard';

  if (view === 'vouchers') {
    const { data, error } = await admin
      .from('zafirix_petty_cash_vouchers')
      .select('*, zafirix_petty_cash_funds(name)')
      .eq('company_id', access.companyId)
      .eq('user_id', session.userId)
      .order('voucher_date', { ascending: false })
      .limit(100);

    if (error) return mapDbError(error, { vouchers: [] });

    const voucherIds = (data ?? []).map((v) => v.id);
    const { data: attachments } = voucherIds.length
      ? await admin.from('zafirix_petty_cash_attachments').select('*').in('voucher_id', voucherIds)
      : { data: [] };

    const attByVoucher = new Map<string, ReturnType<typeof rowToAttachment>[]>();
    for (const a of attachments ?? []) {
      const vid = String(a.voucher_id);
      const arr = attByVoucher.get(vid) ?? [];
      arr.push(rowToAttachment(a as Record<string, unknown>));
      attByVoucher.set(vid, arr);
    }

    const vouchers = (data ?? []).map((v) => {
      const fund = v.zafirix_petty_cash_funds as { name?: string } | null;
      return rowToVoucher(
        { ...(v as Record<string, unknown>), fund_name: fund?.name },
        attByVoucher.get(String(v.id)) ?? [],
      );
    });

    return NextResponse.json({ ok: true, vouchers, expenseCategories: EXPENSE_CATEGORIES });
  }

  const [{ data: funds, error: fundsErr }, { data: entries, error: entriesErr }] = await Promise.all([
    admin
      .from('zafirix_petty_cash_funds')
      .select('*')
      .eq('company_id', access.companyId)
      .eq('user_id', session.userId)
      .order('name'),
    admin
      .from('zafirix_petty_cash_entries')
      .select('*')
      .eq('company_id', access.companyId)
      .eq('user_id', session.userId)
      .order('entry_date', { ascending: false })
      .limit(200),
  ]);

  if (fundsErr) return mapDbError(fundsErr);
  if (entriesErr) return mapDbError(entriesErr, { funds: [], entries: [], balance: 0 });

  const mappedEntries = (entries ?? []).map((r) => rowToEntry(r as Record<string, unknown>));
  const mappedFunds = (funds ?? []).map((f) => {
    const fund = rowToFund(f as Record<string, unknown>);
    const bal = computeFundBalance(mappedEntries, fund.id);
    fund.currentBalance = bal.currentBalance;
    fund.pendingAmount = bal.pendingAmount;
    return fund;
  });

  const balance = mappedFunds.reduce((s, f) => s + (f.currentBalance ?? 0), 0);
  const pendingTotal = mappedEntries
    .filter((e) => e.status === 'pending')
    .reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({
    ok: true,
    funds: mappedFunds,
    entries: mappedEntries,
    balance,
    pendingTotal,
    expenseCategories: EXPENSE_CATEGORIES,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action as string | undefined;

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string | undefined);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const companyId = access.companyId;
  const userId = session.userId;

  if (action === 'create_fund' && body.name) {
    const result = await createPettyCashFund(admin, {
      userId,
      companyId,
      name: String(body.name),
      code: body.code as string | undefined,
      floatAmount: Number(body.floatAmount ?? 0),
      accountingAccount: body.accountingAccount as string | undefined,
      custodianName: body.custodianName as string | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, fund: result.fund });
  }

  if (action === 'create_voucher' && body.fundId && body.amount) {
    const result = await createExpenseVoucher(admin, {
      userId,
      companyId,
      fundId: String(body.fundId),
      amount: Number(body.amount),
      beneficiary: body.beneficiary as string | undefined,
      purpose: body.purpose as string | undefined,
      expenseCategory: body.expenseCategory as string | undefined,
      voucherDate: body.voucherDate as string | undefined,
      attachments: body.attachments as Array<{ fileName: string; fileUrl: string; mimeType?: string; fileSize?: number }> | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, voucher: result.voucher });
  }

  if (action === 'submit_voucher' && body.voucherId) {
    const result = await submitVoucherForApproval(admin, {
      userId,
      companyId,
      voucherId: String(body.voucherId),
      actorName: body.actorName as string | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, voucher: result.voucher });
  }

  if (action === 'replenish' && body.fundId && body.amount) {
    const result = await replenishFund(admin, {
      userId,
      companyId,
      fundId: String(body.fundId),
      amount: Number(body.amount),
      purpose: body.purpose as string | undefined,
      postToAccounting: body.postToAccounting as boolean | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, entryId: result.entryId });
  }

  if (action === 'reconcile' && body.fundId) {
    const result = await reconcilePettyCashFund(admin, {
      userId,
      companyId,
      fundId: String(body.fundId),
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, reconciliation: result.reconciliation });
  }

  if (body.entryType && body.amount != null) {
    const { data, error } = await admin
      .from('zafirix_petty_cash_entries')
      .insert({
        user_id: userId,
        company_id: companyId,
        fund_id: (body.fundId as string) ?? null,
        entry_type: body.entryType,
        amount: body.amount,
        beneficiary: (body.beneficiary as string) ?? null,
        purpose: (body.purpose as string) ?? null,
        entry_date: (body.entryDate as string) ?? new Date().toISOString().slice(0, 10),
        status: 'pending',
      })
      .select('*')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, entry: rowToEntry(data as Record<string, unknown>) });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}

export async function PATCH(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const admin = getSupabaseServiceRoleClient();

  if (body.voucherId && body.action === 'approve') {
    const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string | undefined);
    if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

    const result = await approveVoucher(admin, {
      userId: session.userId,
      companyId: access.companyId,
      voucherId: String(body.voucherId),
      actorName: body.actorName as string | undefined,
      actorRole: body.actorRole as string | undefined,
      comment: body.comment as string | undefined,
      postToAccounting: body.postToAccounting as boolean | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, voucher: result.voucher, entryId: result.entryId });
  }

  if (body.voucherId && body.action === 'reject') {
    const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string | undefined);
    if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

    const result = await rejectVoucher(admin, {
      userId: session.userId,
      companyId: access.companyId,
      voucherId: String(body.voucherId),
      actorName: body.actorName as string | undefined,
      comment: body.comment as string | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, voucher: result.voucher });
  }

  if (body.id && body.status) {
    const { data, error } = await admin
      .from('zafirix_petty_cash_entries')
      .update({
        status: body.status,
        approved_by: (body.approvedBy as string) ?? null,
      })
      .eq('id', body.id)
      .eq('user_id', session.userId)
      .select('*')
      .single();

    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, entry: rowToEntry(data as Record<string, unknown>) });
  }

  return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
}
