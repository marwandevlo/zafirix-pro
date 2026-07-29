/**
 * DELETE/PATCH /api/accounting/entries/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { isValidPcgeAccount } from '@/app/lib/atlas-morocco-compliance';
import type { AtlasAccountingEntry } from '@/app/types/atlas-accounting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(_request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseServiceRoleClient();

  const { error } = await admin
    .from('atlas_accounting_entries')
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

  const { data: existing } = await admin
    .from('atlas_accounting_entries')
    .select('entry_json, validation_status')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const current = existing.entry_json as AtlasAccountingEntry;
  const compte = body.compte != null ? String(body.compte).trim() : current.compte;
  if (!isValidPcgeAccount(compte)) {
    return NextResponse.json(
      { error: 'invalid_pcge_account', message: 'Numéro de compte PCGE invalide (3–8 chiffres).' },
      { status: 400 },
    );
  }

  const updated: AtlasAccountingEntry = {
    ...current,
    date: body.date != null ? String(body.date) : current.date,
    libelle: body.libelle != null ? String(body.libelle).trim() : current.libelle,
    compte,
    debit: body.debit != null ? Number(body.debit) : current.debit,
    credit: body.credit != null ? Number(body.credit) : current.credit,
  };

  const { error } = await admin
    .from('atlas_accounting_entries')
    .update({
      entry_json: updated,
      entry_date: updated.date || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entry: updated });
}
