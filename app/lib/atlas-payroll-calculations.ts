/** Moroccan payroll / IR / IS formula versions — indicative only. */
export const PAYROLL_FORMULA_VERSION = 'ma-payroll-2026-v1';
export const IR_FORMULA_VERSION = 'ma-ir-2026-v1';
export const IS_FORMULA_VERSION = 'ma-is-2026-v1';
export const EXPERT_DISCLAIMER = 'à valider par expert-comptable';

export type PayslipCalculation = {
  grossSalary: number;
  cnssEmployee: number;
  amoEmployee: number;
  irAmount: number;
  netSalary: number;
  cnssEmployer: number;
  amoEmployer: number;
};

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

/** IR barème progressif salarial Maroc (indicatif). */
export function calculateMoroccanIR(baseImposable: number): number {
  const base = Math.max(0, baseImposable);
  if (base <= 2500) return 0;
  if (base <= 4166) return roundMad((base - 2500) * 0.1);
  if (base <= 5000) return roundMad(166.6 + (base - 4166) * 0.2);
  if (base <= 6666) return roundMad(333.4 + (base - 5000) * 0.3);
  if (base <= 15000) return roundMad(832.8 + (base - 6666) * 0.34);
  return roundMad(3666.6 + (base - 15000) * 0.38);
}

/** CNSS salariale 4,48% plafonnée · AMO 2,26% · IR sur base imposable. */
export function calculatePayslip(grossSalary: number): PayslipCalculation {
  const gross = Math.max(0, grossSalary);
  const cnssEmployee = roundMad(Math.min(gross * 0.0448, 339.12));
  const amoEmployee = roundMad(gross * 0.0226);
  const baseIR = gross - cnssEmployee - amoEmployee;
  const irAmount = calculateMoroccanIR(baseIR);
  const netSalary = roundMad(gross - cnssEmployee - amoEmployee - irAmount);
  const cnssEmployer = roundMad(gross * 0.2126);
  const amoEmployer = roundMad(gross * 0.0203);
  return { grossSalary: gross, cnssEmployee, amoEmployee, irAmount, netSalary, cnssEmployer, amoEmployer };
}

/** IS barème indicatif Maroc (taux unique simplifié par tranche de résultat). */
export function calculateEstimatedIS(taxableResult: number): number {
  const r = taxableResult;
  if (r <= 0) return 0;
  if (r <= 300_000) return roundMad(r * 0.1);
  if (r <= 1_000_000) return roundMad(r * 0.2);
  if (r <= 5_000_000) return roundMad(r * 0.26);
  return roundMad(r * 0.31);
}

export function calculateMinimalISContribution(revenueHT: number): number {
  return roundMad(Math.max(0, revenueHT) * 0.005);
}

export function isRateLabel(taxableResult: number): string {
  if (taxableResult <= 0) return '0%';
  if (taxableResult <= 300_000) return '10%';
  if (taxableResult <= 1_000_000) return '20%';
  if (taxableResult <= 5_000_000) return '26%';
  return '31%';
}
