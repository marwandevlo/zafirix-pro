/**
 * GET /api/companies/health — company health score
 * POST /api/companies/switch — switch active company + audit log
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { computeCompanyHealth, healthBandLabelFr } from '@/app/lib/atlas-company-health-engine';
import { logCompanySwitch, switchActiveCompanyServer } from '@/app/lib/atlas-workspace-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const db = getSupabaseServiceRoleClient();
  const health = await computeCompanyHealth(db, userId, companyId);

  return NextResponse.json({
    ok: true,
    health,
    labelFr: healthBandLabelFr(health.band),
  });
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    fromCompanyId?: string | null;
  };

  const companyId = body.companyId?.trim();
  if (!companyId) return NextResponse.json({ error: 'company_id_required' }, { status: 400 });

  const db = getSupabaseServiceRoleClient();
  const switched = await switchActiveCompanyServer(db, userId, companyId);
  if (!switched.ok) return NextResponse.json({ error: switched.error }, { status: 404 });

  await logCompanySwitch(db, userId, body.fromCompanyId ?? null, companyId);

  return NextResponse.json({ ok: true, companyId });
}
