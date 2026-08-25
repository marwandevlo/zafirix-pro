/**
 * POST /api/ai/tax-audit — Smart Tax Audit & Compliance Engine (Morocco).
 * Accepts companyId (DB scan) and/or invoice + ledger payloads (ICE, TVA, RAS, AE ceilings).
 * GET  /api/ai/tax-audit?companyId= — company scan only.
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
  SMART_TAX_AUDIT_ENGINE,
  auditSmartTaxPayload,
  hasAuditablePayloadContent,
  parseSmartTaxAuditBody,
  runSmartTaxAudit,
} from '@/app/lib/zafirix-smart-tax-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const jsonBody =
    request.method === 'POST' ? ((await request.json().catch(() => ({}))) as unknown) : {};
  const payload = parseSmartTaxAuditBody(jsonBody);

  const queryCompanyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!payload.companyId && queryCompanyId) {
    payload.companyId = queryCompanyId;
  }

  const companyId = payload.companyId?.trim() || null;
  const hasPayload = hasAuditablePayloadContent(payload);

  if (!companyId && !hasPayload) {
    return apiBadRequest(
      'payload_or_company_required',
      'Fournissez un companyId ou un payload (factures, écritures, ICE, CA auto-entrepreneur).',
    );
  }

  if (!companyId) {
    const audit = auditSmartTaxPayload(payload);
    return NextResponse.json({
      ok: true,
      engine: SMART_TAX_AUDIT_ENGINE,
      mode: 'payload',
      audit,
    });
  }

  const db = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(db, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  payload.companyId = access.companyId;

  try {
    const audit = await runSmartTaxAudit({
      db,
      userId: session.userId,
      payload,
    });
    return NextResponse.json({
      ok: true,
      engine: SMART_TAX_AUDIT_ENGINE,
      mode: hasPayload ? 'company+payload' : 'company',
      audit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audit_failed';
    if (isMissingTableError(message)) {
      return NextResponse.json({
        ok: true,
        engine: SMART_TAX_AUDIT_ENGINE,
        audit: hasPayload ? auditSmartTaxPayload(payload, companyId) : null,
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
