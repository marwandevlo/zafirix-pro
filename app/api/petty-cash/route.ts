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
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rowToEntry(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    entryType: row.entry_type,
    amount: Number(row.amount ?? 0),
    beneficiary: (row.beneficiary as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    status: row.status,
    entryDate: String(row.entry_date ?? ''),
    approvedBy: (row.approved_by as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const { data, error } = await admin
    .from('zafirix_petty_cash_entries')
    .select('*')
    .eq('company_id', access.companyId)
    .eq('user_id', session.userId)
    .order('entry_date', { ascending: false })
    .limit(100);

  if (error) return mapDbError(error, { entries: [], balance: 0 });

  const entries = (data ?? []).map((r) => rowToEntry(r as Record<string, unknown>));
  const balance = entries
    .filter((e) => e.status === 'approved' || e.status === 'reimbursed')
    .reduce((sum, e) => {
      if (e.entryType === 'replenishment') return sum + e.amount;
      return sum - e.amount;
    }, 0);

  return NextResponse.json({ ok: true, entries, balance });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    companyId?: string;
    entryType?: string;
    amount?: number;
    beneficiary?: string;
    purpose?: string;
    entryDate?: string;
  };

  if (!body.companyId || !body.entryType || body.amount == null) {
    return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const { data, error } = await admin
    .from('zafirix_petty_cash_entries')
    .insert({
      user_id: session.userId,
      company_id: access.companyId,
      entry_type: body.entryType,
      amount: body.amount,
      beneficiary: body.beneficiary ?? null,
      purpose: body.purpose ?? null,
      entry_date: body.entryDate ?? new Date().toISOString().slice(0, 10),
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) return mapDbError(error);
  return NextResponse.json({ ok: true, entry: rowToEntry(data as Record<string, unknown>) });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as { id?: string; status?: string; approvedBy?: string };
  if (!body.id || !body.status) return apiBadRequest('missing_fields', apiErrorMessageFr('missing_fields'));

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('zafirix_petty_cash_entries')
    .update({
      status: body.status,
      approved_by: body.approvedBy ?? null,
    })
    .eq('id', body.id)
    .eq('user_id', session.userId)
    .select('*')
    .single();

  if (error) return mapDbError(error);
  return NextResponse.json({ ok: true, entry: rowToEntry(data as Record<string, unknown>) });
}
