/**
 * POST /api/bank/sync-statements
 * Body: { companyId: string, documentIds?: string[] }
 * Imports bank transactions from Documents IA into zafirix_bank_transactions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { syncBankStatementsFromDocuments } from '@/app/lib/atlas-bank-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { companyId?: string; documentIds?: string[] };
  try {
    body = (await request.json()) as { companyId?: string; documentIds?: string[] };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const companyId = body.companyId?.trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_required', message: 'Société active requise.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseServiceRoleClient();
    const { data: owned } = await admin
      .from('atlas_companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!owned) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404 });
    }

    const result = await syncBankStatementsFromDocuments(
      admin,
      userId,
      companyId,
      body.documentIds,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
