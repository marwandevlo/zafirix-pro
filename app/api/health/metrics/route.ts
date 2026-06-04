import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { collectMetrics } from '@/app/lib/atlas-health-engine';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const db = getSupabaseServiceRoleClient();
  const metrics = await collectMetrics(db);

  return NextResponse.json({
    ok: true,
    metrics,
    dashboardReady: true,
  });
}
