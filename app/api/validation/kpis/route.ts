/**
 * GET /api/validation/kpis
 *
 * Returns validation KPI counts for the dashboard:
 *   - pending_draft: routing records with validation_status = 'draft'
 *   - validated_today: validated today
 *   - rejected: total rejected
 *   - corrections_propagated: count of correction_propagated events
 *   - reviewed: awaiting final validation
 *   - amounts: {draft_total, reviewed_total, validated_total, rejected_total}
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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Run all counts in parallel
  const [
    draftRes,
    reviewedRes,
    validatedTodayRes,
    rejectedRes,
    correctionsRes,
    totalByStatusRes,
    docsValidatedTodayRes,
  ] = await Promise.all([
    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'draft'),

    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'reviewed'),

    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'validated')
      .gte('updated_at', todayStart.toISOString()),

    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'rejected'),

    admin.from('atlas_audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('performed_by', userId)
      .eq('action', 'propagated'),

    admin.from('zafirix_routing_records')
      .select('validation_status, payload')
      .eq('user_id', userId)
      .eq('routing_status', 'completed'),

    admin.from('atlas_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'validated')
      .gte('validated_at', todayStart.toISOString()),
  ]);

  // Compute amount totals by status from payload
  const amountByStatus: Record<string, number> = { draft: 0, reviewed: 0, validated: 0, rejected: 0 };
  if (totalByStatusRes.data) {
    for (const rec of totalByStatusRes.data) {
      const status = rec.validation_status as string;
      const payload = rec.payload as Record<string, unknown> | null;
      const amt = typeof payload?.amount_ttc === 'number' ? payload.amount_ttc : 0;
      if (status in amountByStatus) amountByStatus[status] += amt;
    }
  }

  return NextResponse.json({
    ok: true,
    kpis: {
      pending_draft: draftRes.count ?? 0,
      reviewed: reviewedRes.count ?? 0,
      validated_today: (validatedTodayRes.count ?? 0) + (docsValidatedTodayRes.count ?? 0),
      rejected: rejectedRes.count ?? 0,
      corrections_propagated: correctionsRes.count ?? 0,
    },
    amounts: {
      draft_total: Math.round(amountByStatus.draft),
      reviewed_total: Math.round(amountByStatus.reviewed),
      validated_total: Math.round(amountByStatus.validated),
      rejected_total: Math.round(amountByStatus.rejected),
    },
  });
}
