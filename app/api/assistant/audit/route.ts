/**
 * GET /api/assistant/audit — internal audit report
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { runAtlasAiAudit } from '@/app/lib/atlas-ai-audit';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const download = request.nextUrl.searchParams.get('download') === '1';
  const db = getSupabaseServiceRoleClient();

  const report = await runAtlasAiAudit(db, userId, companyId);

  await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'audit',
    prompt: 'audit_report',
    answer: JSON.stringify({ findings: report.findings.length, recommendations: report.recommendations.length }),
    sourcesUsed: report.sources,
    metadata: { fiscal_year: report.fiscal_year },
  });

  if (download) {
    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="audit-${report.fiscal_year}.json"`,
      },
    });
  }

  return NextResponse.json({ ok: true, report });
}
