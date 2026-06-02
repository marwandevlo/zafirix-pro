/**
 * GET /api/liasse/alerts — Liasse closing alerts (bank, payroll, TVA, generation)
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { collectLiasseAlerts } from '@/app/lib/atlas-liasse-engine';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const admin = getSupabaseServiceRoleClient();
  const alerts = await collectLiasseAlerts(admin, userId, companyId);

  return NextResponse.json({
    ok: true,
    alerts: alerts.map((a) => ({ ...a, created_at: new Date().toISOString() })),
    counts: {
      red: alerts.filter((a) => a.severity === 'red').length,
      orange: alerts.filter((a) => a.severity === 'orange').length,
      yellow: alerts.filter((a) => a.severity === 'yellow').length,
      total: alerts.length,
    },
  });
}
