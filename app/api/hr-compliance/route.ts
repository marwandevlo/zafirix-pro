import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiNotFound,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import {
  addEmployeeDocument,
  ATTENDANCE_STATUS_LABELS,
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  createEmploymentContract,
  DOCUMENT_TYPE_LABELS,
  getHrComplianceDashboard,
  recordAttendance,
  seedEmployeeCompliance,
  syncComplianceOverdue,
  updateComplianceStatus,
} from '@/app/lib/atlas-hr-compliance-server';
import type {
  AttendanceStatus,
  ComplianceStatus,
  ContractType,
  EmployeeDocumentType,
} from '@/app/types/atlas-hr-compliance';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const sync = new URL(request.url).searchParams.get('sync') !== 'false';

  try {
    if (sync) await syncComplianceOverdue(admin, session.userId, access.companyId);
    const dashboard = await getHrComplianceDashboard(admin, session.userId, access.companyId);
    return NextResponse.json({
      ok: true,
      ...dashboard,
      contractTypeLabels: CONTRACT_TYPE_LABELS,
      contractStatusLabels: CONTRACT_STATUS_LABELS,
      documentTypeLabels: DOCUMENT_TYPE_LABELS,
      attendanceStatusLabels: ATTENDANCE_STATUS_LABELS,
      complianceCategoryLabels: COMPLIANCE_CATEGORY_LABELS,
      complianceStatusLabels: COMPLIANCE_STATUS_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'hr_compliance_load_failed';
    return mapDbError({ message: msg }, { employees: [], contracts: [], documents: [], attendance: [], complianceItems: [], summary: {} });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action as string | undefined;

  if (!body.companyId) {
    return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  if (action === 'create_contract' && body.employeeId && body.startDate) {
    try {
      const contract = await createEmploymentContract(admin, session.userId, access.companyId, {
        employeeId: String(body.employeeId),
        contractType: body.contractType as ContractType | undefined,
        startDate: String(body.startDate),
        endDate: body.endDate as string | undefined,
        trialPeriodEnd: body.trialPeriodEnd as string | undefined,
        grossSalaryMad: body.grossSalaryMad != null ? Number(body.grossSalaryMad) : undefined,
        weeklyHours: body.weeklyHours != null ? Number(body.weeklyHours) : undefined,
        workLocation: body.workLocation as string | undefined,
        jobTitle: body.jobTitle as string | undefined,
        signedAt: body.signedAt as string | undefined,
      });
      return NextResponse.json({ ok: true, contract });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'add_document' && body.employeeId && body.title) {
    try {
      const document = await addEmployeeDocument(admin, session.userId, access.companyId, {
        employeeId: String(body.employeeId),
        documentType: body.documentType as EmployeeDocumentType | undefined,
        title: String(body.title),
        fileName: body.fileName as string | undefined,
        fileUrl: body.fileUrl as string | undefined,
        issuedAt: body.issuedAt as string | undefined,
        expiresAt: body.expiresAt as string | undefined,
      });
      return NextResponse.json({ ok: true, document });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'record_attendance' && body.employeeId && body.attendanceDate) {
    try {
      const record = await recordAttendance(admin, session.userId, access.companyId, {
        employeeId: String(body.employeeId),
        attendanceDate: String(body.attendanceDate),
        status: body.status as AttendanceStatus | undefined,
        checkIn: body.checkIn as string | undefined,
        checkOut: body.checkOut as string | undefined,
        notes: body.notes as string | undefined,
      });
      return NextResponse.json({ ok: true, record });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'update_compliance' && body.itemId && body.status) {
    try {
      const item = await updateComplianceStatus(
        admin,
        session.userId,
        access.companyId,
        String(body.itemId),
        body.status as ComplianceStatus,
      );
      if (!item) return apiNotFound('Exigence introuvable.');
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'seed_compliance' && body.employeeId) {
    try {
      const count = await seedEmployeeCompliance(
        admin,
        session.userId,
        access.companyId,
        String(body.employeeId),
      );
      return NextResponse.json({ ok: true, seeded: count });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'sync') {
    const updated = await syncComplianceOverdue(admin, session.userId, access.companyId);
    return NextResponse.json({ ok: true, updated });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
