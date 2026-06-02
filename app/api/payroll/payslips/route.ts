/**
 * GET /api/payroll/payslips — list payslip extractions
 * PATCH /api/payroll/payslips — validate/review/reject
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const status = new URL(request.url).searchParams.get('status');
  const admin = getSupabaseServiceRoleClient();

  let query = admin
    .from('atlas_payslip_extractions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status && status !== 'all') query = query.eq('validation_status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, payslips: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { ids?: string[]; action?: 'review' | 'validate' | 'reject' };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const statusMap = { review: 'reviewed', validate: 'validated', reject: 'rejected' } as const;
  const auditMap = { review: 'reviewed', validate: 'validated', reject: 'rejected' } as const;
  if (!body.ids?.length || !body.action || !(body.action in statusMap)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const newStatus = statusMap[body.action];
  const admin = getSupabaseServiceRoleClient();

  await admin.from('atlas_payslip_extractions')
    .update({ validation_status: newStatus, updated_at: new Date().toISOString() })
    .in('id', body.ids)
    .eq('user_id', userId);

  for (const id of body.ids) {
    void logAuditEvent({
      entityType: 'payroll_record',
      entityId: id,
      action: auditMap[body.action],
      performedBy: userId,
    });
  }

  return NextResponse.json({ ok: true, updated: body.ids.length, status: newStatus });
}
