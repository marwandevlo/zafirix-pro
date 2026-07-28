/**
 * GET /api/bank/pending-statements?companyId=
 * Lists bank statement documents from Documents IA and their sync status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { listPendingBankStatements } from '@/app/lib/atlas-bank-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
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

    const statements = await listPendingBankStatements(admin, userId, companyId);
    const unsyncedCount = statements.filter((s) => !s.synced && s.transactionCount > 0).length;

    return NextResponse.json({
      ok: true,
      statements,
      unsyncedCount,
      total: statements.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'load_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
