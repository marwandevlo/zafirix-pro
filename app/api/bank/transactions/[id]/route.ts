/**
 * DELETE/PATCH /api/bank/transactions/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(_request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseServiceRoleClient();

  const { data: row } = await admin
    .from('zafirix_bank_transactions')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await admin.from('atlas_bank_reconciliation').delete().eq('transaction_id', id).eq('user_id', userId);

  const { error } = await admin
    .from('zafirix_bank_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = getSupabaseServiceRoleClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.description != null) patch.description = String(body.description).trim();
  if (body.reference != null) patch.reference = String(body.reference).trim();
  if (body.transactionDate != null) patch.transaction_date = String(body.transactionDate);
  if (body.debit != null) patch.debit = Number(body.debit);
  if (body.credit != null) patch.credit = Number(body.credit);

  const { data, error } = await admin
    .from('zafirix_bank_transactions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, transaction_date, description, reference, debit, credit, validation_status')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    transaction: {
      id: data.id,
      transactionDate: data.transaction_date,
      description: data.description,
      reference: data.reference,
      debit: Number(data.debit ?? 0),
      credit: Number(data.credit ?? 0),
      validationStatus: data.validation_status,
    },
  });
}
