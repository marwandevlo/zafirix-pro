/**
 * GET /api/liasse/readiness — closing readiness without persisting
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const companyId = params.get('companyId')?.trim() || null;
  const fiscalYear = Number(params.get('fiscalYear') ?? new Date().getFullYear());

  const admin = getSupabaseServiceRoleClient();
  const result = await runLiasseEngine(admin, { userId, companyId, fiscalYear });

  return NextResponse.json({
    ok: true,
    fiscalYear,
    readinessScore: result.readinessScore,
    readinessBreakdown: result.readinessBreakdown,
    checks: result.checks,
    blockingIssues: result.blockingIssues,
    bankSummary: result.bankSummary,
    payrollSummary: result.payrollSummary,
    label: `Prêt pour clôture fiscale: ${result.readinessScore}%`,
  });
}
