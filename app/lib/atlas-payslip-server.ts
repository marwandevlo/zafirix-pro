/**
 * Payslip extraction, employee matching, payroll record linking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasStructuredExtraction } from '@/app/types/atlas-document';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';
import {
  extractNumericFromField,
  extractStringFromField,
} from '@/app/lib/atlas-bank-extraction';

const AUTO_MATCH_THRESHOLD = 75;

export type PayslipExtractionResult = {
  extractionId: string;
  employeeId: string | null;
  matchConfidence: number;
  payrollRunId: string | null;
  salaryId: string | null;
  needsReview: boolean;
};

function parsePeriod(periodStr: string | null): { year: number; month: number } {
  const now = new Date();
  if (!periodStr) return { year: now.getFullYear(), month: now.getMonth() + 1 };
  const m = periodStr.match(/(\d{4})[\/\-](\d{1,2})/);
  if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  const months = ['janvier','février','fevrier','mars','avril','mai','juin','juillet','août','aout','septembre','octobre','novembre','décembre','decembre'];
  const lower = periodStr.toLowerCase();
  for (let i = 0; i < months.length; i++) {
    if (lower.includes(months[i])) return { year: now.getFullYear(), month: i + 1 };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export async function matchEmployee(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  hints: { employeeName?: string | null; cin?: string | null; cnss?: string | null; matricule?: string | null },
): Promise<{ employeeId: string | null; confidence: number }> {
  const { data: employees } = await db
    .from('atlas_employees')
    .select('id, full_name, cin, cnss_matricule, metadata')
    .eq('user_id', userId)
    .eq('company_id', companyId);

  if (!employees?.length) return { employeeId: null, confidence: 0 };

  let bestId: string | null = null;
  let bestScore = 0;

  for (const emp of employees) {
    let score = 0;
    if (hints.cin && emp.cin && String(emp.cin).toLowerCase() === hints.cin.toLowerCase()) score = 100;
    else if (hints.cnss && emp.cnss_matricule && String(emp.cnss_matricule) === hints.cnss) score = 95;
    else if (hints.employeeName && emp.full_name) {
      const a = hints.employeeName.toLowerCase().trim();
      const b = String(emp.full_name).toLowerCase().trim();
      if (a === b) score = 90;
      else if (a.includes(b) || b.includes(a)) score = 80;
      else {
        const wordsA = a.split(/\s+/);
        const wordsB = b.split(/\s+/);
        const overlap = wordsA.filter(w => wordsB.some(x => x.startsWith(w.slice(0, 3)))).length;
        score = Math.round((overlap / Math.max(wordsA.length, 1)) * 70);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = String(emp.id);
    }
  }

  return { employeeId: bestId, confidence: bestScore };
}

export async function createPayslipExtractionFromDocument(
  db: SupabaseClient,
  params: {
    userId: string;
    companyId: string;
    documentId: string;
    extraction: AtlasStructuredExtraction;
    metadata?: Record<string, unknown>;
  },
): Promise<PayslipExtractionResult> {
  const { userId, companyId, documentId, extraction, metadata } = params;
  const ext = extraction as Record<string, unknown>;

  const employeeName = extractStringFromField(ext.employee_name);
  const grossSalary = extractNumericFromField(ext.gross_salary);
  const netSalary = extractNumericFromField(ext.net_salary);
  const cnssAmount = extractNumericFromField(ext.cnss_amount);
  const irAmount = extractNumericFromField(ext.ir_amount);
  const periodStr = extractStringFromField(ext.period);
  const { year, month } = parsePeriod(periodStr);

  const cin = extractStringFromField(ext.cin ?? (metadata?.cin as unknown));
  const cnssNumber = extractStringFromField(ext.cnss_number ?? ext.cnss_matricule ?? (metadata?.cnss as unknown));
  const matricule = extractStringFromField(ext.matricule ?? (metadata?.matricule as unknown));

  const { employeeId, confidence: matchConfidence } = await matchEmployee(db, userId, companyId, {
    employeeName,
    cin,
    cnss: cnssNumber,
    matricule,
  });

  const validationStatus = matchConfidence >= AUTO_MATCH_THRESHOLD ? 'reviewed' : 'draft';

  const { data: row, error } = await db
    .from('atlas_payslip_extractions')
    .insert({
      user_id: userId,
      company_id: companyId,
      source_document_id: documentId,
      employee_id: employeeId,
      employee_name: employeeName,
      matricule,
      cin,
      cnss_number: cnssNumber,
      period_year: year,
      period_month: month,
      gross_salary: grossSalary,
      net_salary: netSalary,
      cnss_amount: cnssAmount,
      ir_amount: irAmount,
      match_confidence: matchConfidence,
      validation_status: validationStatus,
      raw_extraction: extraction as object,
      metadata: { imported_at: new Date().toISOString() },
    })
    .select('id')
    .single();

  if (error || !row) throw new Error(`Payslip extraction failed: ${error?.message ?? 'unknown'}`);

  const extractionId = String(row.id);

  void logAuditEvent({
    entityType: 'payroll_record',
    entityId: extractionId,
    action: 'created',
    performedBy: userId,
    companyId,
    sourceDocumentId: documentId,
    newValues: { employee_name: employeeName, match_confidence: matchConfidence },
  });

  if (employeeId && matchConfidence >= AUTO_MATCH_THRESHOLD) {
    void logAuditEvent({
      entityType: 'payroll_record',
      entityId: extractionId,
      action: 'reviewed',
      performedBy: userId,
      companyId,
      metadata: { matched_employee_id: employeeId },
    });
  }

  // Link to payroll run / salary if employee matched
  let payrollRunId: string | null = null;
  let salaryId: string | null = null;

  if (employeeId && grossSalary != null) {
    const { data: run } = await db
      .from('atlas_payroll_runs')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle();

    if (run && run.status !== 'validated') {
      payrollRunId = String(run.id);
      const { data: sal } = await db
        .from('atlas_salaries')
        .select('id')
        .eq('payroll_run_id', payrollRunId)
        .eq('employee_id', employeeId)
        .maybeSingle();

      if (sal) {
        salaryId = String(sal.id);
        await db.from('atlas_salaries').update({
          gross_salary: grossSalary,
          ...(netSalary != null ? { net_salary: netSalary } : {}),
          ...(cnssAmount != null ? { cnss_employee: cnssAmount } : {}),
          ...(irAmount != null ? { ir_amount: irAmount } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', salaryId);
      }

      await db.from('atlas_payslip_extractions').update({
        payroll_run_id: payrollRunId,
        salary_id: salaryId,
        updated_at: new Date().toISOString(),
      }).eq('id', extractionId);
    }
  }

  return {
    extractionId,
    employeeId,
    matchConfidence,
    payrollRunId,
    salaryId,
    needsReview: matchConfidence < AUTO_MATCH_THRESHOLD,
  };
}
