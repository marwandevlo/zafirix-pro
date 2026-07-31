import type { SupabaseClient } from '@supabase/supabase-js';
import type { Etat9421Data, Etat9421EmployeeLine, Etat9421ExportValidation, Etat9421Totals } from '@/app/types/atlas-ir-export';
import { asRecord } from '@/app/lib/atlas-json';
import { IR_FORMULA_VERSION } from '@/app/lib/atlas-payroll-calculations';
import { listPayrollRuns, getPayrollRunWithSalaries } from '@/app/lib/atlas-payroll-server';
import {
  resolveDgiCompanyIdentifiers,
  resolveDgiIdentifiantFiscal,
} from '@/app/lib/atlas-tva-dgi';

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

export type AtlasIrExportCompanyInfo = {
  name: string | null;
  legal_name: string | null;
  trade_name: string | null;
  if_fiscal: string | null;
  if_number: string | null;
  ice: string | null;
  cnss_number: string | null;
};

export async function loadCompanyIrExportInfo(
  db: SupabaseClient,
  companyId: string,
): Promise<AtlasIrExportCompanyInfo | null> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('name, legal_name, trade_name, if_fiscal, if_number, ice, cnss_number, company_json')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const json = asRecord(row.company_json);
  return {
    name: row.name == null ? null : String(row.name),
    legal_name: row.legal_name == null ? null : String(row.legal_name),
    trade_name: row.trade_name == null ? null : String(row.trade_name),
    if_fiscal:
      row.if_fiscal == null ? (json?.if_fiscal == null ? null : String(json.if_fiscal)) : String(row.if_fiscal),
    if_number: row.if_number == null ? null : String(row.if_number),
    ice: row.ice == null ? (json?.ice == null ? null : String(json.ice)) : String(row.ice),
    cnss_number:
      row.cnss_number == null
        ? (json?.cnss == null ? null : String(json.cnss))
        : String(row.cnss_number),
  };
}

export function validateEtat9421ForExport(data: Etat9421Data): Etat9421ExportValidation {
  if (!data.fiscalYear || data.fiscalYear < 2000) {
    return { ok: false, error: 'invalid_fiscal_year', message: 'Exercice fiscal invalide.' };
  }
  const ifFormatted = resolveDgiIdentifiantFiscal(data.identifiantFiscal);
  if (!ifFormatted) {
    return {
      ok: false,
      error: 'missing_if',
      message: "Identifiant Fiscal (IF) manquant ou invalide pour l'État 9421.",
    };
  }
  if (!data.employees.length) {
    return {
      ok: false,
      error: 'no_payroll_data',
      message: 'Aucune donnée de paie pour cet exercice. Générez les bulletins mensuels d\'abord.',
    };
  }
  return { ok: true };
}

/** Agrège la paie mensuelle sur l'exercice pour l'État 9421 annuel. */
export async function buildEtat9421Data(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
): Promise<Etat9421Data> {
  const company = await loadCompanyIrExportInfo(db, companyId);
  if (!company) throw new Error('company_not_found');

  const runs = await listPayrollRuns(db, userId, companyId);
  const yearRuns = runs.filter((r) => r.periodYear === fiscalYear);

  const employeeMap = new Map<string, Etat9421EmployeeLine>();
  const employeeMeta = new Map<string, { cin?: string; cnssMatricule?: string }>();

  const { data: emps } = await db
    .from('atlas_employees')
    .select('id, full_name, metadata')
    .eq('company_id', companyId)
    .eq('user_id', userId);
  for (const e of emps ?? []) {
    const row = e as { id: string; metadata?: unknown };
    const meta = asRecord(row.metadata) ?? {};
    employeeMeta.set(String(row.id), {
      cin: meta.cin == null ? undefined : String(meta.cin),
      cnssMatricule: meta.cnssMatricule == null ? undefined : String(meta.cnssMatricule),
    });
  }

  for (const run of yearRuns) {
    const full = await getPayrollRunWithSalaries(db, userId, run.id);
    if (!full) continue;
    for (const sal of full.salaries) {
      const meta = employeeMeta.get(sal.employeeId) ?? {};
      const existing = employeeMap.get(sal.employeeId);
      if (existing) {
        existing.moisPayes += 1;
        existing.salaireBrutAnnuel = roundMad(existing.salaireBrutAnnuel + sal.grossSalary);
        existing.cnssSalarialAnnuel = roundMad(existing.cnssSalarialAnnuel + sal.cnssEmployee);
        existing.amoSalarialAnnuel = roundMad(existing.amoSalarialAnnuel + sal.amoEmployee);
        existing.irAnnuel = roundMad(existing.irAnnuel + sal.irAmount);
        existing.salaireNetAnnuel = roundMad(existing.salaireNetAnnuel + sal.netSalary);
        existing.cnssPatronalAnnuel = roundMad(existing.cnssPatronalAnnuel + sal.cnssEmployer);
        existing.amoPatronalAnnuel = roundMad(existing.amoPatronalAnnuel + sal.amoEmployer);
      } else {
        employeeMap.set(sal.employeeId, {
          employeeId: sal.employeeId,
          nom: sal.employeeName ?? sal.employeeId.slice(0, 8),
          cin: meta.cin,
          cnssMatricule: meta.cnssMatricule,
          moisPayes: 1,
          salaireBrutAnnuel: roundMad(sal.grossSalary),
          cnssSalarialAnnuel: roundMad(sal.cnssEmployee),
          amoSalarialAnnuel: roundMad(sal.amoEmployee),
          irAnnuel: roundMad(sal.irAmount),
          salaireNetAnnuel: roundMad(sal.netSalary),
          cnssPatronalAnnuel: roundMad(sal.cnssEmployer),
          amoPatronalAnnuel: roundMad(sal.amoEmployer),
        });
      }
    }
  }

  const employees = Array.from(employeeMap.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const totals: Etat9421Totals = employees.reduce<Etat9421Totals>(
    (acc, e) => ({
      nombreEmployes: acc.nombreEmployes + 1,
      totalBrut: roundMad(acc.totalBrut + e.salaireBrutAnnuel),
      totalCnssSalarial: roundMad(acc.totalCnssSalarial + e.cnssSalarialAnnuel),
      totalAmoSalarial: roundMad(acc.totalAmoSalarial + e.amoSalarialAnnuel),
      totalIr: roundMad(acc.totalIr + e.irAnnuel),
      totalNet: roundMad(acc.totalNet + e.salaireNetAnnuel),
      totalCnssPatronal: roundMad(acc.totalCnssPatronal + e.cnssPatronalAnnuel),
      totalAmoPatronal: roundMad(acc.totalAmoPatronal + e.amoPatronalAnnuel),
      moisCouverts: yearRuns.length,
    }),
    {
      nombreEmployes: 0,
      totalBrut: 0,
      totalCnssSalarial: 0,
      totalAmoSalarial: 0,
      totalIr: 0,
      totalNet: 0,
      totalCnssPatronal: 0,
      totalAmoPatronal: 0,
      moisCouverts: 0,
    },
  );

  const raisonSociale =
    company.trade_name?.trim() || company.legal_name?.trim() || company.name?.trim() || '';
  const ids = resolveDgiCompanyIdentifiers(company);

  return {
    fiscalYear,
    identifiantFiscal: ids.identifiantFiscal,
    ice: ids.ice,
    raisonSociale,
    cnssEmployeur: company.cnss_number?.trim(),
    periodeDu: `${fiscalYear}-01-01`,
    periodeAu: `${fiscalYear}-12-31`,
    formulaVersion: IR_FORMULA_VERSION,
    employees,
    totals,
  };
}
