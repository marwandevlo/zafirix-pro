/**
 * GET /api/dashboard/kpis
 *
 * Aggregated KPIs for the main dashboard.
 * Returns: documents today, validation counts, legal contracts, audit summary.
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

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const expiryAlertDate = new Date();
  expiryAlertDate.setDate(expiryAlertDate.getDate() + 30);

  const [
    docsToday,
    pendingDraft,
    reviewed,
    validatedToday,
    rejected,
    legalActive,
    legalExpiring,
    legalExpired,
    tvaDetected,
    recentAuditEvents,
  ] = await Promise.all([
    // Documents uploaded today
    admin.from('zafirix_ocr_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString()),

    // Routing records pending validation
    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'draft'),

    // Routing records reviewed (awaiting final validation)
    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'reviewed'),

    // Validated today
    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'validated')
      .gte('updated_at', todayStart.toISOString()),

    // Total rejected
    admin.from('zafirix_routing_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('validation_status', 'rejected'),

    // Active legal contracts (not expired)
    admin.from('zafirix_legal_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or(`expiry_date.is.null,expiry_date.gt.${new Date().toISOString().split('T')[0]}`),

    // Expiring contracts (within 30 days)
    admin.from('zafirix_legal_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('expiry_date', new Date().toISOString().split('T')[0])
      .lte('expiry_date', expiryAlertDate.toISOString().split('T')[0]),

    // Expired contracts
    admin.from('zafirix_legal_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('expiry_date', new Date().toISOString().split('T')[0]),

    // TVA detected (tva suggestions from IA)
    admin.from('zafirix_tva_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    // Recent audit activity (last 30 days)
    admin.from('atlas_audit_logs')
      .select('action')
      .eq('performed_by', userId)
      .gte('created_at', thirtyDaysAgo.toISOString()),
  ]);

  // Aggregate audit counts by action
  const auditCounts: Record<string, number> = {};
  for (const row of recentAuditEvents.data ?? []) {
    const a = row.action as string;
    auditCounts[a] = (auditCounts[a] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    kpis: {
      documents_today: docsToday.count ?? 0,
      pending_draft: pendingDraft.count ?? 0,
      reviewed: reviewed.count ?? 0,
      validated_today: validatedToday.count ?? 0,
      rejected: rejected.count ?? 0,
      legal_active: legalActive.count ?? 0,
      legal_expiring: legalExpiring.count ?? 0,
      legal_expired: legalExpired.count ?? 0,
      tva_detected: tvaDetected.count ?? 0,
    },
    audit_last_30d: auditCounts,
  });
}
