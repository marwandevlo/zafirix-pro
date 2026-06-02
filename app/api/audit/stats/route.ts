/**
 * GET /api/audit/stats
 *
 * Returns audit event counts for the last 30 days, grouped by action.
 * Also returns a day-by-day activity count for a sparkline.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const admin = getSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from('atlas_audit_logs')
    .select('action, entity_type, created_at')
    .eq('performed_by', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Action counts
  const byAction: Record<string, number> = {};
  for (const row of rows) {
    const a = row.action as string;
    byAction[a] = (byAction[a] ?? 0) + 1;
  }

  // Entity type counts
  const byEntityType: Record<string, number> = {};
  for (const row of rows) {
    const e = row.entity_type as string;
    byEntityType[e] = (byEntityType[e] ?? 0) + 1;
  }

  // Day-by-day activity (for sparkline, last 30 days)
  const dailyCounts: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyCounts.push({ date: d.toISOString().split('T')[0], count: 0 });
  }
  for (const row of rows) {
    const day = String(row.created_at).split('T')[0];
    const entry = dailyCounts.find(d => d.date === day);
    if (entry) entry.count++;
  }

  return NextResponse.json({
    ok: true,
    period: '30d',
    total: rows.length,
    by_action: byAction,
    by_entity_type: byEntityType,
    daily: dailyCounts,
  });
}
