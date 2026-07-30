/**
 * HR & Labor Law Compliance — contracts, documents, attendance, compliance dashboard.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasEmployeeAttendance,
  AtlasEmployeeDocument,
  AtlasEmployeeProfile,
  AtlasEmploymentContract,
  AtlasHrComplianceItem,
  AttendanceStatus,
  ComplianceCategory,
  CompliancePriority,
  ComplianceStatus,
  ContractStatus,
  ContractType,
  DocumentStatus,
  EmployeeDocumentType,
  HrComplianceDashboard,
  HrComplianceSummary,
} from '@/app/types/atlas-hr-compliance';
import {
  ATTENDANCE_STATUS_LABELS,
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  DEFAULT_COMPLIANCE_TEMPLATES,
  DOCUMENT_TYPE_LABELS,
} from '@/app/types/atlas-hr-compliance';

export {
  ATTENDANCE_STATUS_LABELS,
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  DEFAULT_COMPLIANCE_TEMPLATES,
  DOCUMENT_TYPE_LABELS,
};

function daysUntil(ymd: string | null): number | null {
  if (!ymd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T12:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function computeDocumentStatus(expiresAt: string | null): DocumentStatus {
  const d = daysUntil(expiresAt);
  if (d == null) return 'valid';
  if (d < 0) return 'expired';
  if (d <= 30) return 'expiring';
  return 'valid';
}

function computeComplianceStatus(dueDate: string | null, completedAt: string | null, current: string): ComplianceStatus {
  if (current === 'waived' || current === 'compliant' || completedAt) return current as ComplianceStatus;
  const d = daysUntil(dueDate);
  if (d != null && d < 0) return 'overdue';
  return 'pending';
}

export function rowToContract(row: Record<string, unknown>, employeeName?: string): AtlasEmploymentContract {
  const endDate = (row.end_date as string | null) ?? null;
  const trialEnd = (row.trial_period_end as string | null) ?? null;
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName,
    contractType: row.contract_type as ContractType,
    referenceNumber: (row.reference_number as string | null) ?? null,
    startDate: String(row.start_date ?? ''),
    endDate,
    trialPeriodEnd: trialEnd,
    weeklyHours: Number(row.weekly_hours ?? 44),
    grossSalaryMad: Number(row.gross_salary_mad ?? 0),
    workLocation: (row.work_location as string | null) ?? null,
    jobTitle: (row.job_title as string | null) ?? null,
    noticePeriodDays: Number(row.notice_period_days ?? 30),
    status: row.status as ContractStatus,
    legalBasis: String(row.legal_basis ?? ''),
    signedAt: (row.signed_at as string | null) ?? null,
    daysUntilEnd: daysUntil(endDate),
    daysUntilTrialEnd: daysUntil(trialEnd),
  };
}

export function rowToDocument(row: Record<string, unknown>, employeeName?: string): AtlasEmployeeDocument {
  const expiresAt = (row.expires_at as string | null) ?? null;
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName,
    documentType: row.document_type as EmployeeDocumentType,
    title: String(row.title ?? ''),
    fileName: (row.file_name as string | null) ?? null,
    fileUrl: (row.file_url as string | null) ?? null,
    issuedAt: (row.issued_at as string | null) ?? null,
    expiresAt,
    status: computeDocumentStatus(expiresAt),
    daysUntilExpiry: daysUntil(expiresAt),
  };
}

export function rowToAttendance(row: Record<string, unknown>, employeeName?: string): AtlasEmployeeAttendance {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName,
    attendanceDate: String(row.attendance_date ?? ''),
    status: row.status as AttendanceStatus,
    checkIn: row.check_in ? String(row.check_in).slice(0, 5) : null,
    checkOut: row.check_out ? String(row.check_out).slice(0, 5) : null,
    hoursWorked: row.hours_worked != null ? Number(row.hours_worked) : null,
    notes: (row.notes as string | null) ?? null,
  };
}

export function rowToComplianceItem(row: Record<string, unknown>, employeeName?: string | null): AtlasHrComplianceItem {
  const dueDate = (row.due_date as string | null) ?? null;
  const completedAt = (row.completed_at as string | null) ?? null;
  const status = computeComplianceStatus(dueDate, completedAt, String(row.status ?? 'pending'));
  return {
    id: String(row.id),
    employeeId: (row.employee_id as string | null) ?? null,
    employeeName,
    category: row.category as ComplianceCategory,
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    legalBasis: (row.legal_basis as string | null) ?? null,
    dueDate,
    completedAt,
    status,
    priority: row.priority as CompliancePriority,
    daysUntilDue: daysUntil(dueDate),
  };
}

function buildSummary(
  employees: AtlasEmployeeProfile[],
  contracts: AtlasEmploymentContract[],
  documents: AtlasEmployeeDocument[],
  complianceItems: AtlasHrComplianceItem[],
  attendance: AtlasEmployeeAttendance[],
): HrComplianceSummary {
  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendance.filter((a) => a.attendanceDate === today);
  return {
    totalEmployees: employees.length,
    activeContracts: contracts.filter((c) => c.status === 'active').length,
    expiringContracts: contracts.filter(
      (c) => c.status === 'active' && c.daysUntilEnd != null && c.daysUntilEnd >= 0 && c.daysUntilEnd <= 30,
    ).length,
    documentsExpiring: documents.filter((d) => d.status === 'expiring' || d.status === 'expired').length,
    overdueCompliance: complianceItems.filter((i) => i.status === 'overdue').length,
    attendanceTodayPresent: todayAttendance.filter((a) =>
      ['present', 'remote', 'late'].includes(a.status),
    ).length,
    attendanceTodayTotal: todayAttendance.length,
  };
}

export async function getHrComplianceDashboard(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<HrComplianceDashboard> {
  const { data: empRows, error: empErr } = await admin
    .from('atlas_employees')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('full_name');

  if (empErr) throw new Error(empErr.message);

  const empMap = new Map<string, string>();
  for (const e of empRows ?? []) {
    empMap.set(String(e.id), String(e.full_name ?? ''));
  }

  const [contractRes, docRes, attRes, compRes] = await Promise.all([
    admin.from('zafirix_employment_contracts').select('*').eq('company_id', companyId).order('start_date', { ascending: false }),
    admin.from('zafirix_employee_documents').select('*').eq('company_id', companyId).order('expires_at'),
    admin.from('zafirix_employee_attendance').select('*').eq('company_id', companyId).order('attendance_date', { ascending: false }).limit(200),
    admin.from('zafirix_hr_compliance_items').select('*').eq('company_id', companyId).order('due_date'),
  ]);

  const contracts = (contractRes.data ?? []).map((r) =>
    rowToContract(r as Record<string, unknown>, empMap.get(String(r.employee_id))),
  );

  const activeContractByEmployee = new Map<string, AtlasEmploymentContract>();
  for (const c of contracts) {
    if (c.status === 'active' && !activeContractByEmployee.has(c.employeeId)) {
      activeContractByEmployee.set(c.employeeId, c);
    }
  }

  const documents = (docRes.data ?? []).map((r) =>
    rowToDocument(r as Record<string, unknown>, empMap.get(String(r.employee_id))),
  );

  const docCountByEmployee = new Map<string, number>();
  for (const d of documents) {
    docCountByEmployee.set(d.employeeId, (docCountByEmployee.get(d.employeeId) ?? 0) + 1);
  }

  const complianceItems = (compRes.data ?? []).map((r) =>
    rowToComplianceItem(
      r as Record<string, unknown>,
      r.employee_id ? empMap.get(String(r.employee_id)) ?? null : null,
    ),
  );

  const overdueByEmployee = new Map<string, number>();
  for (const item of complianceItems) {
    if (item.status === 'overdue' && item.employeeId) {
      overdueByEmployee.set(item.employeeId, (overdueByEmployee.get(item.employeeId) ?? 0) + 1);
    }
  }

  const employees: AtlasEmployeeProfile[] = (empRows ?? []).map((e) => {
    const id = String(e.id);
    return {
      id,
      companyId: (e.company_id as string | null) ?? null,
      fullName: String(e.full_name ?? ''),
      email: (e.email as string | null) ?? null,
      phone: (e.phone as string | null) ?? null,
      roleTitle: (e.role_title as string | null) ?? null,
      department: (e.department as string | null) ?? null,
      cin: (e.cin as string | null) ?? null,
      cnssMatricule: (e.cnss_matricule as string | null) ?? null,
      grossSalaryMad: Number(e.gross_salary_mad ?? 0),
      hireDate: (e.hire_date as string | null) ?? null,
      status: String(e.status ?? 'active'),
      activeContract: activeContractByEmployee.get(id) ?? null,
      documentCount: docCountByEmployee.get(id) ?? 0,
      complianceOverdue: overdueByEmployee.get(id) ?? 0,
    };
  });

  const attendance = (attRes.data ?? []).map((r) =>
    rowToAttendance(r as Record<string, unknown>, empMap.get(String(r.employee_id))),
  );

  return {
    employees,
    contracts,
    documents,
    attendance,
    complianceItems,
    summary: buildSummary(employees, contracts, documents, complianceItems, attendance),
  };
}

export async function createEmploymentContract(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    employeeId: string;
    contractType?: ContractType;
    startDate: string;
    endDate?: string;
    trialPeriodEnd?: string;
    grossSalaryMad?: number;
    weeklyHours?: number;
    workLocation?: string;
    jobTitle?: string;
    noticePeriodDays?: number;
    signedAt?: string;
  },
): Promise<AtlasEmploymentContract> {
  const { data: emp } = await admin
    .from('atlas_employees')
    .select('full_name, gross_salary_mad')
    .eq('id', input.employeeId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!emp) throw new Error('employee_not_found');

  const year = new Date().getFullYear();
  const ref = `${(input.contractType ?? 'cdi').toUpperCase()}-${year}-${input.employeeId.slice(0, 6)}`;

  const { data, error } = await admin
    .from('zafirix_employment_contracts')
    .insert({
      user_id: userId,
      company_id: companyId,
      employee_id: input.employeeId,
      contract_type: input.contractType ?? 'cdi',
      reference_number: ref,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      trial_period_end: input.trialPeriodEnd ?? null,
      gross_salary_mad: input.grossSalaryMad ?? Number(emp.gross_salary_mad ?? 0),
      weekly_hours: input.weeklyHours ?? 44,
      work_location: input.workLocation ?? null,
      job_title: input.jobTitle ?? null,
      notice_period_days: input.noticePeriodDays ?? 30,
      signed_at: input.signedAt ?? null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'contract_create_failed');

  await seedEmployeeCompliance(admin, userId, companyId, input.employeeId);

  return rowToContract(data as Record<string, unknown>, String(emp.full_name ?? ''));
}

export async function seedEmployeeCompliance(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  employeeId: string,
): Promise<number> {
  const { data: existing } = await admin
    .from('zafirix_hr_compliance_items')
    .select('id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .limit(1);

  if (existing && existing.length > 0) return 0;

  const dueBase = new Date();
  dueBase.setDate(dueBase.getDate() + 30);
  const defaultDue = dueBase.toISOString().slice(0, 10);

  const rows = DEFAULT_COMPLIANCE_TEMPLATES.map((t) => ({
    user_id: userId,
    company_id: companyId,
    employee_id: employeeId,
    category: t.category,
    title: t.title,
    legal_basis: t.legalBasis,
    priority: t.priority,
    due_date: defaultDue,
    status: 'pending',
  }));

  const { error } = await admin.from('zafirix_hr_compliance_items').insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function addEmployeeDocument(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    employeeId: string;
    documentType?: EmployeeDocumentType;
    title: string;
    fileName?: string;
    fileUrl?: string;
    issuedAt?: string;
    expiresAt?: string;
  },
): Promise<AtlasEmployeeDocument> {
  const expiresAt = input.expiresAt ?? null;
  const { data, error } = await admin
    .from('zafirix_employee_documents')
    .insert({
      user_id: userId,
      company_id: companyId,
      employee_id: input.employeeId,
      document_type: input.documentType ?? 'other',
      title: input.title,
      file_name: input.fileName ?? null,
      file_url: input.fileUrl ?? null,
      issued_at: input.issuedAt ?? null,
      expires_at: expiresAt,
      status: computeDocumentStatus(expiresAt),
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'document_create_failed');
  return rowToDocument(data as Record<string, unknown>);
}

export async function recordAttendance(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    employeeId: string;
    attendanceDate: string;
    status?: AttendanceStatus;
    checkIn?: string;
    checkOut?: string;
    notes?: string;
  },
): Promise<AtlasEmployeeAttendance> {
  const { data, error } = await admin
    .from('zafirix_employee_attendance')
    .upsert(
      {
        user_id: userId,
        company_id: companyId,
        employee_id: input.employeeId,
        attendance_date: input.attendanceDate,
        status: input.status ?? 'present',
        check_in: input.checkIn ?? null,
        check_out: input.checkOut ?? null,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id,attendance_date' },
    )
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'attendance_failed');
  return rowToAttendance(data as Record<string, unknown>);
}

export async function updateComplianceStatus(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  itemId: string,
  status: ComplianceStatus,
): Promise<AtlasHrComplianceItem | null> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'compliant') patch.completed_at = new Date().toISOString().slice(0, 10);

  const { data, error } = await admin
    .from('zafirix_hr_compliance_items')
    .update(patch)
    .eq('id', itemId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToComplianceItem(data as Record<string, unknown>);
}

export async function syncComplianceOverdue(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { data: items } = await admin
    .from('zafirix_hr_compliance_items')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('status', ['pending']);

  let updated = 0;
  for (const row of items ?? []) {
    const due = row.due_date as string | null;
    if (due && daysUntil(due) != null && daysUntil(due)! < 0) {
      await admin
        .from('zafirix_hr_compliance_items')
        .update({ status: 'overdue', updated_at: new Date().toISOString() })
        .eq('id', String(row.id));
      updated++;
    }
  }

  const { data: docs } = await admin
    .from('zafirix_employee_documents')
    .select('*')
    .eq('company_id', companyId);

  for (const row of docs ?? []) {
    const status = computeDocumentStatus(row.expires_at as string | null);
    if (status !== row.status) {
      await admin
        .from('zafirix_employee_documents')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', String(row.id));
    }
  }

  return updated;
}
