import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasIrSnapshot, AtlasPayrollRun, AtlasSalary } from '@/app/types/atlas-payroll';
import { asRecord } from '@/app/lib/atlas-json';
import {
  calculatePayslip,
  EXPERT_DISCLAIMER,
  IR_FORMULA_VERSION,
  PAYROLL_FORMULA_VERSION,
} from '@/app/lib/atlas-payroll-calculations';

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

async function assertCompanyOwned(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('company_not_found');
}

function rowToRun(row: Record<string, unknown>): AtlasPayrollRun {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    periodYear: Number(row.period_year),
    periodMonth: Number(row.period_month),
    status: String(row.status) === 'validated' ? 'validated' : 'draft',
    totalGross: Number(row.total_gross ?? 0),
    totalCnssEmployee: Number(row.total_cnss_employee ?? 0),
    totalAmoEmployee: Number(row.total_amo_employee ?? 0),
    totalIr: Number(row.total_ir ?? 0),
    totalNet: Number(row.total_net ?? 0),
    formulaVersion: String(row.formula_version ?? PAYROLL_FORMULA_VERSION),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function rowToSalary(row: Record<string, unknown>, employeeName?: string): AtlasSalary {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    payrollRunId: String(row.payroll_run_id),
    employeeId: String(row.employee_id),
    employeeName,
    grossSalary: Number(row.gross_salary ?? 0),
    cnssEmployee: Number(row.cnss_employee ?? 0),
    amoEmployee: Number(row.amo_employee ?? 0),
    irAmount: Number(row.ir_amount ?? 0),
    netSalary: Number(row.net_salary ?? 0),
    cnssEmployer: Number(row.cnss_employer ?? 0),
    amoEmployer: Number(row.amo_employer ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function rowToIrSnapshot(row: Record<string, unknown>): AtlasIrSnapshot {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    payrollRunId: row.payroll_run_id == null ? null : String(row.payroll_run_id),
    periodYear: Number(row.period_year),
    periodMonth: Number(row.period_month),
    totalIr: Number(row.total_ir ?? 0),
    totalGross: Number(row.total_gross ?? 0),
    employeeCount: Number(row.employee_count ?? 0),
    formulaVersion: String(row.formula_version ?? IR_FORMULA_VERSION),
    disclaimer: String(row.disclaimer ?? EXPERT_DISCLAIMER),
    snapshotJson: asRecord(row.snapshot_json) ?? {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

type EmployeeRow = {
  id: string;
  full_name: string;
  gross_salary_mad: number | string | null;
  status: string;
  company_id: string | null;
};

export async function listPayrollRuns(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<AtlasPayrollRun[]> {
  await assertCompanyOwned(db, userId, companyId);
  const { data, error } = await db
    .from('atlas_payroll_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToRun(r as Record<string, unknown>));
}

export async function getPayrollRunWithSalaries(
  db: SupabaseClient,
  userId: string,
  runId: string,
): Promise<{ run: AtlasPayrollRun; salaries: AtlasSalary[] } | null> {
  const { data: runRow, error } = await db
    .from('atlas_payroll_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!runRow) return null;

  const { data: salRows, error: salErr } = await db
    .from('atlas_salaries')
    .select('*')
    .eq('payroll_run_id', runId)
    .eq('user_id', userId);
  if (salErr) throw new Error(salErr.message);

  const employeeIds = (salRows ?? []).map((s) => String((s as Record<string, unknown>).employee_id));
  const names = new Map<string, string>();
  if (employeeIds.length) {
    const { data: emps } = await db.from('atlas_employees').select('id, full_name').in('id', employeeIds);
    for (const e of emps ?? []) {
      names.set(String((e as { id: string }).id), String((e as { full_name: string }).full_name));
    }
  }

  return {
    run: rowToRun(runRow as Record<string, unknown>),
    salaries: (salRows ?? []).map((r) =>
      rowToSalary(r as Record<string, unknown>, names.get(String((r as Record<string, unknown>).employee_id))),
    ),
  };
}

export async function createOrRefreshPayrollRun(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  periodYear: number,
  periodMonth: number,
): Promise<{ run: AtlasPayrollRun; salaries: AtlasSalary[] }> {
  await assertCompanyOwned(db, userId, companyId);

  const { data: employees, error: empErr } = await db
    .from('atlas_employees')
    .select('id, full_name, gross_salary_mad, status, company_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('status', 'active');
  if (empErr) throw new Error(empErr.message);

  const active = (employees ?? []) as EmployeeRow[];
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from('atlas_payroll_runs')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle();

  if (existing && String((existing as Record<string, unknown>).status) === 'validated') {
    const full = await getPayrollRunWithSalaries(db, userId, String((existing as Record<string, unknown>).id));
    if (!full) throw new Error('run_not_found');
    return full;
  }

  let totals = { gross: 0, cnss: 0, amo: 0, ir: 0, net: 0 };
  const salaryPayloads: { emp: EmployeeRow; calc: ReturnType<typeof calculatePayslip> }[] = [];

  for (const emp of active) {
    const gross = Number(emp.gross_salary_mad ?? 0);
    if (gross <= 0) continue;
    const calc = calculatePayslip(gross);
    totals.gross += calc.grossSalary;
    totals.cnss += calc.cnssEmployee;
    totals.amo += calc.amoEmployee;
    totals.ir += calc.irAmount;
    totals.net += calc.netSalary;
    salaryPayloads.push({ emp, calc });
  }

  const runPayload = {
    user_id: userId,
    company_id: companyId,
    period_year: periodYear,
    period_month: periodMonth,
    status: 'draft',
    total_gross: roundMad(totals.gross),
    total_cnss_employee: roundMad(totals.cnss),
    total_amo_employee: roundMad(totals.amo),
    total_ir: roundMad(totals.ir),
    total_net: roundMad(totals.net),
    formula_version: PAYROLL_FORMULA_VERSION,
    updated_at: now,
  };

  let runId: string;
  if (existing) {
    runId = String((existing as Record<string, unknown>).id);
    const { error: updErr } = await db.from('atlas_payroll_runs').update(runPayload).eq('id', runId);
    if (updErr) throw new Error(updErr.message);
    await db.from('atlas_salaries').delete().eq('payroll_run_id', runId);
  } else {
    const { data: inserted, error: insErr } = await db
      .from('atlas_payroll_runs')
      .insert(runPayload)
      .select('*')
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? 'run_insert_failed');
    runId = String((inserted as Record<string, unknown>).id);
  }

  if (salaryPayloads.length) {
    const rows = salaryPayloads.map(({ emp, calc }) => ({
      user_id: userId,
      company_id: companyId,
      payroll_run_id: runId,
      employee_id: emp.id,
      gross_salary: calc.grossSalary,
      cnss_employee: calc.cnssEmployee,
      amo_employee: calc.amoEmployee,
      ir_amount: calc.irAmount,
      net_salary: calc.netSalary,
      cnss_employer: calc.cnssEmployer,
      amo_employer: calc.amoEmployer,
      updated_at: now,
    }));
    const { error: salInsErr } = await db.from('atlas_salaries').insert(rows);
    if (salInsErr) throw new Error(salInsErr.message);
  }

  await syncIrSnapshot(db, userId, companyId, runId, periodYear, periodMonth);

  const full = await getPayrollRunWithSalaries(db, userId, runId);
  if (!full) throw new Error('run_not_found');
  return full;
}

export async function validatePayrollRun(
  db: SupabaseClient,
  userId: string,
  runId: string,
): Promise<AtlasPayrollRun> {
  const { data, error } = await db
    .from('atlas_payroll_runs')
    .update({ status: 'validated', updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('run_not_found');
  return rowToRun(data as Record<string, unknown>);
}

export async function listIrSnapshots(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<AtlasIrSnapshot[]> {
  await assertCompanyOwned(db, userId, companyId);
  const { data, error } = await db
    .from('atlas_ir_snapshots')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToIrSnapshot(r as Record<string, unknown>));
}

async function syncIrSnapshot(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  payrollRunId: string,
  periodYear: number,
  periodMonth: number,
): Promise<void> {
  const full = await getPayrollRunWithSalaries(db, userId, payrollRunId);
  if (!full) return;

  const payload = {
    user_id: userId,
    company_id: companyId,
    payroll_run_id: payrollRunId,
    period_year: periodYear,
    period_month: periodMonth,
    total_ir: full.run.totalIr,
    total_gross: full.run.totalGross,
    employee_count: full.salaries.length,
    formula_version: IR_FORMULA_VERSION,
    disclaimer: EXPERT_DISCLAIMER,
    snapshot_json: {
      salaries: full.salaries.map((s) => ({
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        grossSalary: s.grossSalary,
        irAmount: s.irAmount,
        netSalary: s.netSalary,
      })),
    },
  };

  const { data: existing } = await db
    .from('atlas_ir_snapshots')
    .select('id')
    .eq('company_id', companyId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle();

  if (existing) {
    await db
      .from('atlas_ir_snapshots')
      .update(payload)
      .eq('id', String((existing as Record<string, unknown>).id));
  } else {
    await db.from('atlas_ir_snapshots').insert(payload);
  }
}

export async function getCurrentPayrollForCompany(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  ref = new Date(),
): Promise<{ run: AtlasPayrollRun; salaries: AtlasSalary[] } | null> {
  const year = ref.getFullYear();
  const month = ref.getMonth() + 1;
  const { data } = await db
    .from('atlas_payroll_runs')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle();
  if (!data) return null;
  return getPayrollRunWithSalaries(db, userId, String((data as Record<string, unknown>).id));
}
