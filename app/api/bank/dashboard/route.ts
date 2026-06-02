/**
 * GET /api/bank/dashboard — banking KPIs for dashboard
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  const [txCount, stmtCount, reconRes] = await Promise.all([
    admin.from('zafirix_bank_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('zafirix_bank_statements').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('atlas_bank_reconciliation').select('status').eq('user_id', userId),
  ]);

  const recons = reconRes.data ?? [];
  const kpis = {
    transactions_imported: txCount.count ?? 0,
    statements: stmtCount.count ?? 0,
    reconciled: recons.filter(r => r.status === 'matched').length,
    suggested: recons.filter(r => r.status === 'suggested').length,
    unmatched: recons.filter(r => r.status === 'unmatched').length,
    alerts: recons.filter(r => r.status === 'unmatched').length + recons.filter(r => r.status === 'suggested').length,
  };

  return NextResponse.json({ ok: true, kpis });
}
