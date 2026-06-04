import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { createOrRefreshPayrollRun, listPayrollRuns } from '@/app/lib/atlas-payroll-server';
import { checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import { requireCompanyRole, permissionJsonResponse } from '@/app/lib/atlas-permissions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const runs = await listPayrollRuns(ctx.db, ctx.userId, companyId);
    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'list_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    periodYear?: number;
    periodMonth?: number;
  };

  const companyId = String(body.companyId ?? '').trim();
  const ref = new Date();
  const periodYear = body.periodYear ?? ref.getFullYear();
  const periodMonth = body.periodMonth ?? ref.getMonth() + 1;

  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  const adminDb = getSupabaseServiceRoleClient();
  const perm = await requireCompanyRole(adminDb, ctx.userId, companyId, 'payroll_manager');
  if (!perm.ok) return permissionJsonResponse(perm);

  const { workspaceId } = await ensureWorkspaceSubscription(adminDb, ctx.userId);
  const wsRate = checkWorkspaceRateLimit(workspaceId, 'payroll_run', ctx.userId);
  if (!wsRate.ok) {
    const rl = rateLimitResponse(wsRate);
    return NextResponse.json(rl.body, { status: rl.status });
  }
  const meter = await meterFeatureUsage(adminDb, ctx.userId, 'payroll_run', { companyId });
  if (!meter.ok) {
    return NextResponse.json({ error: meter.code, message: meter.messageFr }, { status: meter.status });
  }

  try {
    const result = await createOrRefreshPayrollRun(ctx.db, ctx.userId, companyId, periodYear, periodMonth);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'run_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
