/**
 * GET /api/payroll/dashboard — payroll KPIs + CNSS + IR summary
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = new URL(request.url).searchParams.get('companyId');
  const admin = getSupabaseServiceRoleClient();
  const now = new Date();

  let empQuery = admin.from('atlas_employees').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (companyId) empQuery = empQuery.eq('company_id', companyId);

  let payslipQuery = admin.from('atlas_payslip_extractions').select('id, validation_status, gross_salary, cnss_amount, ir_amount').eq('user_id', userId);
  if (companyId) payslipQuery = payslipQuery.eq('company_id', companyId);

  let runQuery = admin.from('atlas_payroll_runs').select('*').eq('user_id', userId)
    .eq('period_year', now.getFullYear()).eq('period_month', now.getMonth() + 1);
  if (companyId) runQuery = runQuery.eq('company_id', companyId);

  const [empRes, payslipRes, runRes] = await Promise.all([empQuery, payslipQuery, runQuery]);

  const payslips = payslipRes.data ?? [];
  const run = runRes.data?.[0];

  const cnssTotal = payslips.reduce((s, p) => s + Number(p.cnss_amount ?? 0), 0)
    + (run ? Number(run.total_cnss_employee ?? 0) + Number(run.total_amo_employee ?? 0) : 0);
  const irTotal = payslips.reduce((s, p) => s + Number(p.ir_amount ?? 0), 0)
    + (run ? Number(run.total_ir ?? 0) : 0);

  const kpis = {
    employees: empRes.count ?? 0,
    payslips_extracted: payslips.length,
    payslips_draft: payslips.filter(p => p.validation_status === 'draft').length,
    payslips_validated: payslips.filter(p => p.validation_status === 'validated').length,
    cnss_total: Math.round(cnssTotal),
    ir_total: Math.round(irTotal),
    payroll_run_status: run?.status ?? null,
    anomalies: payslips.filter(p => p.validation_status === 'draft').length,
  };

  return NextResponse.json({
    ok: true,
    kpis,
    cnss: {
      total_employees: empRes.count ?? 0,
      total_cnss: Math.round(cnssTotal),
      pending_declarations: payslips.filter(p => !p.cnss_amount).length,
    },
    ir: {
      retained_ir: Math.round(irTotal),
      payroll_taxes: Math.round(irTotal + cnssTotal * 0.1),
      period: `${now.getMonth() + 1}/${now.getFullYear()}`,
    },
  });
}
