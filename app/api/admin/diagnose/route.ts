/**
 * GET /api/admin/diagnose
 * Autonomous journey diagnostics (routes, DB integrity, ICE/TVA rules, optional HTTP probes).
 *
 * Query:
 *  - baseUrl=https://…  optional live HTTP probe
 *  - skipDb=1           skip Supabase probes
 */
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { runFullJourneyDiagnose } from '@/app/lib/zafirix-journey-diagnose-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const skipDb = request.nextUrl.searchParams.get('skipDb') === '1';
  const baseUrl =
    request.nextUrl.searchParams.get('baseUrl')?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    null;

  let db = null;
  if (!skipDb) {
    try {
      db = getSupabaseServiceRoleClient();
    } catch {
      db = null;
    }
  }

  const report = await runFullJourneyDiagnose({
    projectRoot: path.join(/* turbopackIgnore: true */ process.cwd()),
    db,
    baseUrl,
  });

  return NextResponse.json({
    ok: report.ok,
    admin: { id: guard.adminUserId, email: guard.adminEmail },
    report,
  });
}
