/**
 * POST /api/audit/compliance — run Moroccan accounting & tax compliance audit.
 * GET  /api/audit/compliance?companyId= — same (convenience).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess, isMissingTableError } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
} from '@/app/lib/atlas-api-response';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  MOROCCO_COMPLIANCE_ENGINE,
  runMoroccoComplianceAudit,
} from '@/app/lib/zafirix-compliance-audit-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body =
    request.method === 'POST'
      ? ((await request.json().catch(() => ({}))) as { companyId?: string })
      : {};
  const companyId =
    (body.companyId ?? request.nextUrl.searchParams.get('companyId') ?? '').trim() || null;

  if (!companyId) {
    return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
  }

  const db = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(db, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  try {
    const audit = await runMoroccoComplianceAudit(db, {
      userId: session.userId,
      companyId: access.companyId,
    });
    return NextResponse.json({
      ok: true,
      engine: MOROCCO_COMPLIANCE_ENGINE,
      audit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audit_failed';
    if (isMissingTableError(message)) {
      return NextResponse.json({
        ok: true,
        engine: MOROCCO_COMPLIANCE_ENGINE,
        audit: null,
        warning: apiErrorMessageFr('table_missing'),
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
